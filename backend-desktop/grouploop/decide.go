package grouploop

import (
	"encoding/json"
	"math/rand"
	"regexp"
	"strings"
	"time"

	"lingxi-agent/db"
)

var mentionRe = regexp.MustCompile(`@([\p{Han}\w_-]{1,40})`)

// Decision 是否发言
type Decision struct {
	ShouldSpeak bool
	Forced      bool
	DelayMs     int
}

// Decide 轻量决策：仅 @本 Agent / 回复本 Agent 时强制；其余按概率，避免全员接龙
func Decide(member db.GroupMember, recent []db.GroupMessage, trigger string, personality *db.AgentPersonality, humanNickname string) Decision {
	if personality == nil {
		personality = &db.AgentPersonality{
			SpeakProbability:  38,
			MinDelayMs:        1200,
			MaxDelayMs:        4500,
			ColdStartEligible: true,
		}
	}
	if humanNickname == "" {
		humanNickname = "我"
	}

	var latest *db.GroupMessage
	if len(recent) > 0 {
		latest = &recent[len(recent)-1]
	}

	if latest != nil {
		// 仅 @ 本 Agent 时强制（@ 人类用户不会让全员开口）
		if mentionedAgent(latest, member.AgentName) {
			return Decision{ShouldSpeak: true, Forced: true, DelayMs: 80 + rand.Intn(600)}
		}
		if replyTargetsName(latest, member.AgentName) {
			return Decision{ShouldSpeak: true, Forced: true, DelayMs: 80 + rand.Intn(600)}
		}
	}

	// 自己刚说完：轻量唤醒不接，避免接龙；用户破冰/ticker/强制保底 除外
	if latest != nil && latest.SenderAgentName == member.AgentName && latest.MsgType != "user_post" {
		if trigger != "ticker" && trigger != "icebreaker" && trigger != "wake_full" && trigger != "wake_full_forced" {
			if trigger == "wake_light" {
				// 少量随机插话
				if rand.Intn(100) > 35 {
					return Decision{}
				}
				return Decision{ShouldSpeak: true, DelayMs: 200 + rand.Intn(1800)}
			}
			return Decision{}
		}
	}

	switch trigger {
	case "wake_full_forced":
		// 用户发言后被指派的「保底接话人」：必定回应，彻底杜绝用户消息无人理睬的冷场
		return Decision{ShouldSpeak: true, Forced: true, DelayMs: 150 + rand.Intn(900)}
	case "icebreaker":
		if len(recent) > 8 {
			return Decision{}
		}
		if rollSpeak(member, recent, personality, 62, latest) {
			return Decision{ShouldSpeak: true, DelayMs: 200 + rand.Intn(1200)}
		}
		return Decision{}
	case "wake_full":
		// 用户发言：提高接话率，避免出现「人等 Agent」过长空窗
		if rollSpeak(member, recent, personality, 62, latest) {
			return Decision{ShouldSpeak: true, DelayMs: 120 + rand.Intn(1800)}
		}
		return Decision{}
	case "wake_light":
		if latest == nil {
			return Decision{}
		}
		if latest.MsgType == "user_post" {
			if rollSpeak(member, recent, personality, 52, latest) {
				return Decision{ShouldSpeak: true, DelayMs: 200 + rand.Intn(1400)}
			}
			return Decision{}
		}
		// 其他 Agent 发言后：适当提高插一句的概率，让对话你来我往不断线
		if rollSpeak(member, recent, personality, 44, latest) {
			return Decision{ShouldSpeak: true, DelayMs: 300 + rand.Intn(2400)}
		}
		return Decision{}
	case "wake":
		return Decide(member, recent, "wake_full", personality, humanNickname)
	case "ticker":
		if !personality.ColdStartEligible {
			return Decision{}
		}
		if latest == nil {
			if rollSpeak(member, recent, personality, 40, latest) {
				return Decision{ShouldSpeak: true, DelayMs: 400 + rand.Intn(2000)}
			}
			return Decision{}
		}
		lastAt, _ := db.GetLastGroupMessageTime(latest.RoomID)
		// 冷场兜底：静默超过 45s 即可有人重启话题（原 90s 过久，体验上像「没人了」）
		if time.Since(lastAt) < 45*time.Second {
			return Decision{}
		}
		chain := agentChainDepth(recent)
		if chain > 6 {
			return Decision{}
		}
		p := personality.SpeakProbability / 2
		if p < 18 {
			p = 18
		}
		if rollSpeak(member, recent, personality, p, latest) {
			return Decision{ShouldSpeak: true, DelayMs: 600 + rand.Intn(3500)}
		}
	}
	return Decision{}
}

// rollSpeak 综合概率摇号（base 为基准百分比 0-100）
func rollSpeak(member db.GroupMember, recent []db.GroupMessage, p *db.AgentPersonality, base int, latest *db.GroupMessage) bool {
	score := float64(base)
	if p != nil && p.SpeakProbability > 0 {
		score = float64(p.SpeakProbability) * 0.55
		if base > 0 {
			score = (score + float64(base)) / 2
		}
	}
	if latest != nil && latest.MsgType == "user_post" {
		score += 12
	}
	if dist, ok := recentSpeakerDistance(recent, member.AgentName); ok {
		if dist == 0 {
			score *= 0.12
		} else if dist <= 2 {
			score *= 0.4
		}
	}
	chain := agentChainDepth(recent)
	if chain > 2 {
		switch {
		case chain <= 4:
			score *= 0.55
		case chain <= 7:
			score *= 0.28
		default:
			score *= 0.1
		}
	}
	if score > 90 {
		score = 90
	}
	return rand.Intn(100) < int(score)
}

func agentChainDepth(recent []db.GroupMessage) int {
	n := 0
	for i := len(recent) - 1; i >= 0; i-- {
		if recent[i].MsgType == "user_post" {
			break
		}
		if recent[i].MsgType == "message" && recent[i].SenderAgentName != "" {
			n++
		}
	}
	return n
}

func recentSpeakerDistance(recent []db.GroupMessage, name string) (int, bool) {
	human := db.NexusHumanNickname()
	for i := len(recent) - 1; i >= 0; i-- {
		m := recent[i]
		if m.MsgType != "message" && m.MsgType != "user_post" {
			continue
		}
		speaker := m.SenderAgentName
		if m.MsgType == "user_post" {
			speaker = human
		}
		if speaker == name {
			return (len(recent) - 1) - i, true
		}
	}
	return 999, false
}

func mentionedAgent(msg *db.GroupMessage, agentName string) bool {
	if msg == nil || agentName == "" {
		return false
	}
	plain := extractPlainForMention(msg.Content)
	for _, n := range parseMentionNames(plain) {
		if n == agentName {
			return true
		}
	}
	var arr []struct {
		AgentName string `json:"agent_name"`
	}
	if msg.MentionedAgents != "" && msg.MentionedAgents != "[]" {
		_ = json.Unmarshal([]byte(msg.MentionedAgents), &arr)
		for _, m := range arr {
			if m.AgentName == agentName {
				return true
			}
		}
	}
	return false
}

func extractPlainForMention(content string) string {
	content = strings.TrimSpace(content)
	if content == "" || content[0] != '[' {
		return content
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal([]byte(content), &blocks) == nil {
		var parts []string
		for _, b := range blocks {
			if b.Type == "text" {
				parts = append(parts, b.Text)
			}
		}
		return strings.Join(parts, "\n")
	}
	return content
}

func parseMentionNames(text string) []string {
	matches := mentionRe.FindAllStringSubmatch(text, -1)
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		out = append(out, m[1])
	}
	return out
}

func replyTargetsName(msg *db.GroupMessage, name string) bool {
	if msg == nil || msg.ReplyToID <= 0 {
		return false
	}
	orig, err := db.GetGroupMessage(msg.ReplyToID)
	if err != nil || orig == nil {
		return false
	}
	return orig.SenderAgentName == name
}
