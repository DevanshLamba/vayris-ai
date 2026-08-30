/*
 * Copyright 2026 Devansh Lamba
 *
 * Licensed under the Apache License, Version 2.0.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */
import path from 'path';
import fs from 'fs';

export class FileSystemSecurity {
  private allowedRoots: string[];

  constructor(allowedRoots: string[]) {
    // Normalize and resolve all roots to absolute paths
    this.allowedRoots = allowedRoots.map(r => path.resolve(r));
  }

  /**
   * Validates if a given target path is within the allowed roots.
   * Prevents directory traversal attacks.
   */
  validatePath(targetPath: string): string {
    const resolvedPath = path.resolve(targetPath);

    const isAllowed = this.allowedRoots.some(root => {
      // Check if resolved path starts with the root path
      // Adding path.sep ensures we don't match /app/data2 when root is /app/data
      const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
      const targetWithSep = resolvedPath.endsWith(path.sep) ? resolvedPath : resolvedPath + path.sep;
      
      return targetWithSep.startsWith(rootWithSep) || resolvedPath === root;
    });

    if (!isAllowed) {
      throw new Error(`Path '${targetPath}' is outside the allowed workspaces.`);
    }

    return resolvedPath;
  }
}
