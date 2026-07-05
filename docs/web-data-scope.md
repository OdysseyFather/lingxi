# 灵犀 Web 多租户 — 数据作用域清单

## 全局只读（user_id = 0 或 system 表）

| 资源 | 说明 |
|------|------|
| `providers` | 供应商预设配置 |
| `system_config` | 开放注册、默认配额等 |
| 系统 skill 模板 | 市场只读模板，安装后复制到用户 scope |

## Per-user（必须带 user_id）

| 表 | 说明 |
|----|------|
| sessions / messages | 对话与消息 |
| agents / skills（已安装） | 用户智能体与技能 |
| knowledge / vector_chunks | 知识库与向量 |
| memories | 长期记忆 |
| usage_quotas / user_quota_limits | 配额 |
| auth_tokens | 登录 token |
| group_chats / group_messages | Nexus 群聊 |

## Web 禁用（桌面专属）

见 [web-disabled-routes.md](./web-disabled-routes.md)
