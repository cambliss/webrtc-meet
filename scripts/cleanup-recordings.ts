import { promises as fs } from "node:fs";
import path from "node:path";

type WalkResult = {
  deletedFiles: number;
  deletedDirs: number;
};

async function walkAndDeleteOldFiles(params: {
  dir: string;
  cutoffMs: number;
}): Promise<WalkResult> {
  let deletedFiles = 0;
  let deletedDirs = 0;

  const entries = await fs.readdir(params.dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const fullPath = path.join(params.dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "shared-files") {
        continue;
      }

      const child = await walkAndDeleteOldFiles({ dir: fullPath, cutoffMs: params.cutoffMs });
      deletedFiles += child.deletedFiles;
      deletedDirs += child.deletedDirs;

      const remaining = await fs.readdir(fullPath).catch(() => []);
      if (remaining.length === 0) {
        await fs.rmdir(fullPath).catch(() => undefined);
        deletedDirs += 1;
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) {
      continue;
    }

    if (stat.mtimeMs < params.cutoffMs) {
      await fs.unlink(fullPath).catch(() => undefined);
      deletedFiles += 1;
    }
  }

  return { deletedFiles, deletedDirs };
}

async function main() {
  const retentionDays = Math.max(1, Number(process.env.RECORDINGS_RETENTION_DAYS || "30"));
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const root = path.resolve(process.cwd(), process.env.RECORDINGS_DIR || "recordings");

  const rootExists = await fs
    .stat(root)
    .then((value) => value.isDirectory())
    .catch(() => false);

  if (!rootExists) {
    process.stdout.write("Recordings cleanup: root directory does not exist, nothing to do.\n");
    return;
  }

  const result = await walkAndDeleteOldFiles({ dir: root, cutoffMs });
  process.stdout.write(
    `Recordings cleanup complete. deletedFiles=${result.deletedFiles} deletedDirs=${result.deletedDirs}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Recordings cleanup failed: ${String(error)}\n`);
  process.exit(1);
});
