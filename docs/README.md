# Documentation

Complete reference documentation for Claude Code Fallback Proxy (Cloudflare Workers).

## 📖 Documentation Map

```
┌─────────────────────────────────────────────┐
│        START HERE: ../README.md              │
│      (Features, Quick Start, Examples)       │
└─────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────┐
│     Choose Your Path Based on Role           │
└─────────────────────────────────────────────┘
         ↙              ↓              ↖
    DEVELOPER      OPERATOR        USER/ADMIN
       ↓               ↓               ↓
   CONTRIB.md    RUNBOOK.md        INDEX.md
   SCRIPTS.md    ENV-VARS.md       MIGRATION-NOTES.md
```

## 📚 Documentation By Role

### 👨‍💻 For Developers

| Document | Purpose | Time |
|----------|---------|------|
| [CLAUDE.md](../CLAUDE.md) | Project architecture and guidance | 5 min |
| [CONTRIB.md](CONTRIB.md) | Development workflow and setup | 15 min |
| [TESTING.md](TESTING.md) | Test suite guide and patterns | 15 min |
| [SCRIPTS.md](SCRIPTS.md) | Available npm scripts | 5 min |

**What you'll learn:**
- How to set up local development environment
- Project structure and file organization
- How to test changes locally
- Test suite architecture and writing tests
- Code style guidelines
- Common development tasks

### 🚀 For Operators/DevOps

| Document | Purpose | Time |
|----------|---------|------|
| [RUNBOOK.md](RUNBOOK.md) | Deployment and operations | 20 min |
| [ENV-VARS.md](ENV-VARS.md) | Configuration reference | 10 min |
| [MIGRATION-NOTES.md](MIGRATION-NOTES.md) | Upgrade from v0.1.0 | 10 min |

**What you'll learn:**
- How to deploy to Cloudflare Workers
- How to monitor and debug in production
- How to troubleshoot common issues
- How to backup and restore configuration
- How to manage secrets securely

### 👤 For Users/Admins

| Document | Purpose | Time |
|----------|---------|------|
| [../README.md](../README.md) | Features and quick start | 10 min |
| [INDEX.md](INDEX.md) | Quick reference guide | 5 min |
| [RUNBOOK.md](RUNBOOK.md) | Troubleshooting | 10 min |

**What you'll learn:**
- How to configure fallback providers
- How to access the admin panel
- How to test the proxy is working
- Common issues and solutions

### 🔗 For API Consumers

| Document | Purpose |
|----------|---------|
| [../README.md](../README.md#api-reference) | API endpoints |
| [../CLAUDE.md](../CLAUDE.md#core-components) | Architecture |
| [INDEX.md](INDEX.md#api-documentation) | Quick API reference |

**What you'll learn:**
- How to call the proxy endpoint
- Expected request/response formats
- How the fallback chain works

---

## 🔍 Quick Find

### I want to...

- **Set up local development** → [CONTRIB.md](CONTRIB.md#setup)
- **Run tests** → [TESTING.md](TESTING.md#running-tests) or [SCRIPTS.md](SCRIPTS.md#run-tests)
- **Write new tests** → [TESTING.md](TESTING.md#writing-tests)
- **Deploy to production** → [RUNBOOK.md](RUNBOOK.md#initial-setup)
- **Add a fallback provider** → [INDEX.md](INDEX.md#add-a-fallback-provider)
- **Debug a problem** → [RUNBOOK.md](RUNBOOK.md#troubleshooting) or [CONTRIB.md](CONTRIB.md#troubleshooting-development)
- **Understand the architecture** → [CLAUDE.md](../CLAUDE.md#architecture)
- **See all npm scripts** → [SCRIPTS.md](SCRIPTS.md)
- **Configure environment variables** → [ENV-VARS.md](ENV-VARS.md)
- **Migrate from v0.1.0** → [MIGRATION-NOTES.md](MIGRATION-NOTES.md#migration-path-for-existing-users)
- **Understand the admin panel** → [INDEX.md](INDEX.md#admin-panel) or [CLAUDE.md](../CLAUDE.md#admin-panel)
- **Manage configuration via API** → [RUNBOOK.md](RUNBOOK.md#configuration-management)
- **Backup/restore config** → [RUNBOOK.md](RUNBOOK.md#backup-configuration)
- **Monitor production** → [RUNBOOK.md](RUNBOOK.md#real-time-logs)
- **View available scripts** → [SCRIPTS.md](SCRIPTS.md)

---

## 📋 Document Summaries

### CLAUDE.md
**Status:** ✅ Current
**Size:** 4.7 KB
**Purpose:** Development guidance and project overview

Key sections:
- Commands reference (dev, deploy, type-check)
- Architecture overview
- Core components explanation
- Configuration details
- Admin panel features

### README.md
**Status:** ✅ Current
**Size:** 5.1 KB
**Purpose:** User-facing documentation

Key sections:
- Features list
- Quick start guide
- Configuration examples
- API reference
- Troubleshooting guide

### SCRIPTS.md
**Status:** ✅ Current
**Size:** 2.0 KB
**Purpose:** npm scripts reference

Key sections:
- Development scripts (dev, deploy, tail)
- Test scripts (test, test:watch, test:coverage)
- Type checking
- Usage examples
- CI/CD integration

### TESTING.md
**Status:** ✅ Current
**Size:** 12.5 KB
**Purpose:** Test suite guide and best practices

Key sections:
- Test coverage overview (99%+ coverage)
- Running tests
- Test architecture and structure
- Key testing utilities
- Writing tests guide
- Test patterns (fallback chain, auth, errors)
- Best practices
- Debugging tests
- CI/CD integration

### CONTRIB.md
**Status:** ✅ Current
**Size:** 4.5 KB
**Purpose:** Contributor and developer guide

Key sections:
- Development workflow
- Local setup
- Code structure
- Testing procedures
- Code style guidelines
- Common tasks
- Troubleshooting

### RUNBOOK.md
**Status:** ✅ Current
**Size:** 8.6 KB
**Purpose:** Operations and deployment manual

Key sections:
- Initial deployment setup (3 steps)
- Redeployment procedures
- Monitoring and debugging
- Configuration management
- 7 common issues with fixes
- Rollback procedures
- Maintenance tasks
- Emergency contacts

### ENV-VARS.md
**Status:** ✅ Current
**Size:** 6.4 KB
**Purpose:** Complete configuration reference

Key sections:
- ADMIN_TOKEN documentation
- DEBUG variable guide
- KV binding reference
- Local development variables
- Type validation
- Secrets management
- Troubleshooting table

### INDEX.md
**Status:** ✅ Current
**Size:** 4.1 KB
**Purpose:** Documentation index and quick reference

Key sections:
- Documentation map
- Architecture overview
- File structure
- Quick reference
- Common tasks
- Troubleshooting links

### MIGRATION-NOTES.md
**Status:** ✅ Current
**Size:** 5.6 KB
**Purpose:** Version history and migration guide

Key sections:
- Version history
- Platform migration details
- Code structure changes
- Configuration migration
- Deployment changes
- Feature comparison
- Migration path
- Breaking changes

---

## 🔗 Cross-References

- **New to the project?** Start with [README.md](../README.md)
- **Development questions?** Check [CONTRIB.md](CONTRIB.md)
- **Testing questions?** Read [TESTING.md](TESTING.md)
- **Deployment issues?** See [RUNBOOK.md](RUNBOOK.md)
- **Configuration help?** Visit [ENV-VARS.md](ENV-VARS.md)
- **Coming from v0.1.0?** Read [MIGRATION-NOTES.md](MIGRATION-NOTES.md)
- **Need to find something?** Browse [INDEX.md](INDEX.md)
- **Which script should I run?** Check [SCRIPTS.md](SCRIPTS.md)

---

## 📞 Getting Help

If you can't find what you need:

1. **Search documentation** — Use Ctrl+F to search all docs
2. **Check the troubleshooting section** — Most issues are covered
3. **Open an issue** — [GitHub Issues](https://github.com/broven/claude-code-fallback/issues)
4. **Read the examples** — All major features have examples

---

## 📝 Documentation Maintenance

Last updated: Feb 5, 2025
Version: 0.2.0
Status: ✅ Complete and current

All documentation reflects the current Cloudflare Workers implementation.
