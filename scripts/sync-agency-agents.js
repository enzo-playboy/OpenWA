"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFrontmatter = parseFrontmatter;
exports.syncAgencyAgents = syncAgencyAgents;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function parseFrontmatter(content) {
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    if (!match) {
        return { metadata: {}, body: content.trim() };
    }
    const [, yamlStr, body] = match;
    const metadata = {};
    yamlStr.split(/\r?\n/).forEach((line) => {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
            const key = line.slice(0, colonIndex).trim();
            let val = line.slice(colonIndex + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            metadata[key] = val;
        }
    });
    return { metadata, body: body.trim() };
}
function syncAgencyAgents() {
    const baseDir = path.resolve(__dirname, '../agency-agents');
    const outputFilePath = path.resolve(__dirname, '../data/agency-agents-registry.json');
    if (!fs.existsSync(baseDir)) {
        console.error(`Directory not found: ${baseDir}`);
        return [];
    }
    const templates = [];
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const category = entry.name;
            const categoryDir = path.join(baseDir, category);
            const files = fs.readdirSync(categoryDir);
            for (const file of files) {
                if (file.endsWith('.md')) {
                    const filePath = path.join(categoryDir, file);
                    const rawContent = fs.readFileSync(filePath, 'utf-8');
                    const { metadata, body } = parseFrontmatter(rawContent);
                    const slug = file.replace(/\.md$/, '');
                    const template = {
                        slug,
                        category,
                        name: metadata.name || slug.replace(/-/g, ' ').toUpperCase(),
                        description: metadata.description || '',
                        color: metadata.color || '#3B82F6',
                        emoji: metadata.emoji || '🤖',
                        vibe: metadata.vibe || '',
                        systemPrompt: body,
                        filePath: path.relative(path.resolve(__dirname, '..'), filePath).replace(/\\/g, '/'),
                    };
                    templates.push(template);
                }
            }
        }
    }
    const outputDir = path.dirname(outputFilePath);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputFilePath, JSON.stringify(templates, null, 2), 'utf-8');
    console.log(`Successfully synced ${templates.length} agency agent templates to ${outputFilePath}`);
    return templates;
}
if (require.main === module) {
    syncAgencyAgents();
}
//# sourceMappingURL=sync-agency-agents.js.map