import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TempDir } from "@oh-my-pi/pi-utils";
import { SkillDescriptionCatalog } from "../src/extensibility/skill-descriptions";
import { loadSkills, resetActiveSkillsForTests, setActiveSkills } from "../src/extensibility/skills";
import { parseInternalUrl } from "../src/internal-urls/parse";
import { SkillProtocolHandler } from "../src/internal-urls/skill-protocol";
import { buildSystemPrompt } from "../src/system-prompt";

const NO_DEFAULT_SOURCES = {
	enableCodexUser: false,
	enableClaudeUser: false,
	enableClaudeProject: false,
	enablePiUser: false,
	enablePiProject: false,
	enableAgentsUser: false,
	enableAgentsProject: false,
} as const;

const longDescription = (i: number) =>
	`Use for frappe-area-${i} work: doctypes, controllers, hooks, whitelisted APIs, permissions, reports, ` +
	`print formats, migrations and background jobs. Covers v14 to v16 differences and common pitfalls ${i}.`;

function skillsSection(systemPrompt: string[]): string {
	return systemPrompt.join("\n").match(/<skills>\n([\s\S]*?)\n<\/skills>/)![1]!;
}

afterEach(() => resetActiveSkillsForTests());

describe("skills.listMode compact", () => {
	it("caps 61 skills, keeps pinned full text, lists every name, and every skill still resolves", async () => {
		using temp = TempDir.createSync("omp-skill-list-mode-");
		const root = temp.join("skills");
		for (let i = 0; i < 61; i++) {
			const dir = path.join(root, `frappe-skill-${i}`);
			await fs.mkdir(dir, { recursive: true });
			await Bun.write(
				path.join(dir, "SKILL.md"),
				`---\nname: frappe-skill-${i}\ndescription: "${longDescription(i)}"\n---\n\n# body ${i}\n`,
			);
		}
		// Managed/plugin skills on the host may load too; keep only the synthetic ones.
		const skills = (await loadSkills({ ...NO_DEFAULT_SOURCES, customDirectories: [root] })).skills.filter(s =>
			s.name.startsWith("frappe-skill-"),
		);
		expect(skills).toHaveLength(61);

		const pinned = ["frappe-skill-7", "frappe-skill-42"];
		const maxChars = 4_000; // chosen so ~27 skills overflow to the trailing note, all names visible
		const build = (listMode: "full" | "compact") =>
			buildSystemPrompt({
				cwd: temp.path(),
				skills,
				skillsSettings: { listMode, pinned, compactMaxChars: maxChars },
				skillDescriptions: new SkillDescriptionCatalog({ dbPath: temp.join(`${listMode}.db`) }),
				contextFiles: [],
			});
		const full = skillsSection((await build("full")).systemPrompt);
		const compact = skillsSection((await build("compact")).systemPrompt);

		// (a) under the cap, and actually smaller than the full list.
		expect(compact.length).toBeLessThanOrEqual(maxChars);
		expect(compact.length).toBeLessThan(full.length);

		// (b) pinned skills keep their whole description; others are truncated.
		for (const name of pinned) {
			const n = Number(name.split("-").pop());
			expect(compact).toContain(`- ${name}: ${longDescription(n)}`);
		}
		expect(compact).not.toContain(longDescription(0));

		// The trailing note names overflow at budget=4000, so rely on skill:// for full-list discovery.
		expect(compact).toMatch(/^- …: \d+ more — load any via skill:\/\/<name>/m);

		// (c) every skill resolves via skill:// regardless of the list mode.
		setActiveSkills(skills);
		const handler = new SkillProtocolHandler();
		for (let i = 0; i < 61; i++) {
			const resource = await handler.resolve(parseInternalUrl(`skill://frappe-skill-${i}`));
			expect(resource.content).toContain(`# body ${i}`);
		}
	});

	it("never exceeds the cap even when names alone overflow it", () => {
		using temp = TempDir.createSync("omp-skill-list-tiny-");
		const skills = Array.from({ length: 61 }, (_, i) => ({
			name: `skill-${i}`,
			description: longDescription(i),
			filePath: `/s/${i}/SKILL.md`,
			baseDir: `/s/${i}`,
			source: "test",
		}));
		const rendered = new SkillDescriptionCatalog({ dbPath: temp.join("d.db") }).renderCompact(skills, {
			maxChars: 200,
		});
		const total = rendered.reduce((sum, s) => sum + s.name.length + s.description.length + 5, 0);
		expect(total).toBeLessThanOrEqual(200);
	});
});
