# Fregoli

Self-evolving web application on a Cordis kernel, named for Leopoldo Fregoli, the quick-change artist. Boot plugins: web UI, **Grok CLI** as the agent, and a replaceable assistant. Specified, not implemented.

CLI: `fregoli` (not `freg`). Flag: `fregoli --assistant`.

```bash
npx tsx src/cli.ts
# http://127.0.0.1:8080/
```

Inhabitant image (Hermetarium or any Docker host):

```bash
docker build -t fregoli:local .
```

- [SPEC.md](SPEC.md) — product spec
- [IMPLEMENTATION.md](IMPLEMENTATION.md) — interruptible implementation steps (local commits)

Running inside [Hermetarium](https://github.com/pihme/hermetarium) is a recommended deployment, not a requirement.

License: [PolyForm Noncommercial 1.0.0](LICENSE) (same family as Hermetarium). Not OSI Open Source.
