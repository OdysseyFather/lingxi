class Agent {
  final int id;
  final String name;
  final String? emoji;
  final String? avatar;
  final String role;
  final String? description;
  final String systemPrompt;
  final double temperature;
  final int maxTokens;
  final String? model;
  final String createdAt;

  Agent({
    required this.id,
    required this.name,
    this.emoji,
    this.avatar,
    this.role = '',
    this.description,
    this.systemPrompt = '',
    this.temperature = 0.7,
    this.maxTokens = 4096,
    this.model,
    this.createdAt = '',
  });

  factory Agent.fromJson(Map<String, dynamic> json) => Agent(
    id: json['id'] ?? 0,
    name: json['name'] ?? '助手',
    emoji: json['emoji'],
    avatar: json['avatar'],
    role: json['role'] ?? '',
    description: json['description'],
    systemPrompt: json['system_prompt'] ?? '',
    temperature: (json['temperature'] ?? 0.7).toDouble(),
    maxTokens: json['max_tokens'] ?? 4096,
    model: json['model'],
    createdAt: json['created_at'] ?? '',
  );
}
