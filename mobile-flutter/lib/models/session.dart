class Session {
  final int id;
  final String title;
  final int agentId;
  final String agentName;
  final String? agentEmoji;
  final bool pinned;
  final String createdAt;
  final String updatedAt;

  Session({
    required this.id,
    required this.title,
    required this.agentId,
    this.agentName = '',
    this.agentEmoji,
    this.pinned = false,
    required this.createdAt,
    required this.updatedAt,
  });

  factory Session.fromJson(Map<String, dynamic> json) => Session(
    id: json['id'] ?? 0,
    title: json['title'] ?? '新对话',
    agentId: json['agent_id'] ?? 0,
    agentName: json['agent_name'] ?? '',
    agentEmoji: json['agent_emoji'],
    pinned: json['pinned'] == 1 || json['pinned'] == true,
    createdAt: json['created_at'] ?? '',
    updatedAt: json['updated_at'] ?? '',
  );
}
