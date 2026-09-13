# Vosk model archive — packaging requirements

`useVoskWakeWord.ts` loads `vosk-model-small-en-us-0.15.tar.gz` from this folder.

**The archive must be a gzipped tar containing real directory entries whose mode
includes the execute bit.** This is not cosmetic. Getting it wrong breaks speech
recognition completely, with misleading errors.

## Why

`vosk-browser` extracts the archive with libarchive into an emscripten IDBFS
mount at `/vosk/<slug>`, then calls `new Model(path)`.

A `.zip` produced on Windows (Explorer "Send to > Compressed folder",
`Compress-Archive`) stores `create_system = FAT`, mode `0600` on every entry,
and **no directory entries at all** — just files with backslash-separated paths.
libarchive then synthesizes the parent directories without an execute bit.

In emscripten, `FS.mayLookup()` requires `x` on a directory to resolve anything
inside it. So with such an archive:

- `FS.readdir('/vosk/<slug>/am')` still works (it reads `node.contents`), so the
  files *look* present.
- `FS.stat('/vosk/<slug>/am/final.mdl')` throws `Error: FS error`.
- `IDBFS.getLocalSet()` walks the tree recursively during `FS.syncfs()` and dies
  on the first untraversable directory — surfacing as
  `Failed to sync file system: Error: FS error`.
- `new Model()` calls `access(path + "/am/final.mdl")`, which fails, and reports
  `Folder '/vosk/<slug>' does not contain model files`.

The sync error is a *symptom*. Do not "fix" it by making `syncFilesystem()`
non-fatal — the model constructor reads the same unreadable tree and fails
immediately afterwards. Fix the archive.

## Regenerating the archive

```sh
npm run package:vosk-model
```

or manually, from a directory containing the unpacked `vosk-model-small-en-us-0.15/`:

```sh
tar --owner=0 --group=0 --numeric-owner --mode='u=rwX,go=rX' \
    -czf vosk-model-small-en-us-0.15.tar.gz vosk-model-small-en-us-0.15
```

`u=rwX` (capital X) sets the execute bit on directories only, never on files.

## Verifying

```sh
tar -tvzf vosk-model-small-en-us-0.15.tar.gz
```

Every directory line must read `drwxr-xr-x`, and the listing must contain the
directory entries themselves (`.../am/`), not only the files inside them.
`npm run package:vosk-model` asserts both.
