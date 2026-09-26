# Contributing

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE). Other licenses can be negotiated with the copyright holder.

## Contributions

This project does not accept outside code contributions at the moment, so that its licensing stays in one hand. Issues, bug reports and ideas are very welcome: please [open an issue](https://github.com/pihme/fregoli/issues/new/choose).

## Good issues

Pick the matching [issue form](https://github.com/pihme/fregoli/issues/new/choose) (bug report, container / Hermetarium, documentation, feature request, question). A good report names the Fregoli version or commit, Node version and OS, how you started it (CLI or Docker), what you did, what you expected and what happened, with logs or a screenshot if they help.

## Build and test locally

Needs Node 22+. Docker is optional ([inhabitant image](https://github.com/pihme/hermetarium) test is skipped without it).

```bash
npm ci
npm test
```

The tests use a stand-in for the Grok CLI. A live Grok turn needs the Grok CLI authenticated (`grok` on `PATH`).
