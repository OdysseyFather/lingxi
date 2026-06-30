package grouploop

import (
	"context"
	"math/rand"
	"sync"
	"time"

	"lingxi-agent/db"
)

type agentLoop struct {
	roomID   int64
	member   db.GroupMember
	wakeCh   chan string
	speaking sync.Mutex
}

func (l *agentLoop) run(ctx context.Context, personality *db.AgentPersonality) {
	min, max := 35000, 75000
	if personality != nil {
		if personality.MinDelayMs > 0 {
			min = personality.MinDelayMs * 10
			if min < 28000 {
				min = 28000
			}
		}
		if personality.MaxDelayMs > 0 {
			max = personality.MaxDelayMs * 16
			if max < min+20000 {
				max = min + 20000
			}
		}
	}
	tickerDur := time.Duration(min+rand.Intn(max-min+1)) * time.Millisecond
	ticker := time.NewTicker(tickerDur)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case mode := <-l.wakeCh:
			l.trySpeak(mode, personality)
		case <-ticker.C:
			l.trySpeak("ticker", personality)
			ticker.Reset(time.Duration(min+rand.Intn(max-min+1)) * time.Millisecond)
		}
	}
}

// wakeFull 用户消息：短延迟并发
func (l *agentLoop) wakeFull() {
	select {
	case l.wakeCh <- "wake_full":
	default:
		select {
		case <-l.wakeCh:
		default:
		}
		l.wakeCh <- "wake_full"
	}
}

// wakeFullForced 用户消息：指派该 Agent 必定回应（保底接话人，杜绝冷场）
func (l *agentLoop) wakeFullForced() {
	select {
	case l.wakeCh <- "wake_full_forced":
	default:
		select {
		case <-l.wakeCh:
		default:
		}
		l.wakeCh <- "wake_full_forced"
	}
}

// wakeLight Agent 消息：轻量接话
func (l *agentLoop) wakeLight() {
	select {
	case l.wakeCh <- "wake_light":
	default:
	}
}

func (l *agentLoop) trySpeak(trigger string, personality *db.AgentPersonality) {
	if speakFn == nil {
		return
	}
	if !l.speaking.TryLock() {
		return
	}
	go func() {
		defer l.speaking.Unlock()

		room, err := db.GetGroupChat(l.roomID)
		if err != nil || room == nil || room.Status != "active" {
			return
		}

		humanNick := db.NexusHumanNickname()
		recent, _ := db.GetRecentGroupMessages(l.roomID, 50)
		dec := Decide(l.member, recent, trigger, personality, humanNick)
		if !dec.ShouldSpeak {
			return
		}

		time.Sleep(time.Duration(dec.DelayMs) * time.Millisecond)

		room, _ = db.GetGroupChat(l.roomID)
		if room == nil || room.Status != "active" {
			return
		}

		speakFn(SpeakRequest{
			RoomID:    l.roomID,
			AgentID:   l.member.AgentID,
			AgentName: l.member.AgentName,
			Trigger:   trigger,
			Forced:    dec.Forced,
		})
	}()
}

func (l *agentLoop) icebreaker(personality *db.AgentPersonality) {
	go func() {
		time.Sleep(time.Duration(200+rand.Intn(1200)) * time.Millisecond)
		if speakFn == nil {
			return
		}
		room, _ := db.GetGroupChat(l.roomID)
		if room == nil || room.Status != "active" {
			return
		}
		recent, _ := db.GetRecentGroupMessages(l.roomID, 50)
		dec := Decide(l.member, recent, "icebreaker", personality, db.NexusHumanNickname())
		if !dec.ShouldSpeak {
			return
		}
		time.Sleep(time.Duration(dec.DelayMs) * time.Millisecond)
		speakFn(SpeakRequest{
			RoomID:    l.roomID,
			AgentID:   l.member.AgentID,
			AgentName: l.member.AgentName,
			Trigger:   "icebreaker",
			Forced:    dec.Forced,
		})
	}()
}
