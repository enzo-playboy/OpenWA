export interface AgencyAgentTemplate {
    slug: string;
    category: string;
    name: string;
    description: string;
    color?: string;
    emoji?: string;
    vibe?: string;
    systemPrompt: string;
    filePath: string;
}
export declare function parseFrontmatter(content: string): {
    metadata: Record<string, string>;
    body: string;
};
export declare function syncAgencyAgents(): AgencyAgentTemplate[];
