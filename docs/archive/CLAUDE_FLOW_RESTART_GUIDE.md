# Claude Flow Project Restart Guide
*Cannabis CRM - Resuming with Memory Intact*

## Overview
This guide shows you how to restart and resume your Cannabis CRM project if the terminal is terminated, ensuring you pick up exactly where you left off with the Queen coordinator and agent swarm ready with full collective memory.

## Quick Restart Commands

```bash
# Navigate to your project
cd /Users/joshuastokes/Documents/Projects/cake/cake-crm

# The memory persists in .hive-mind/ directory
# Your collective memory is already saved and will auto-load

# Start a new Claude Code session
claude-code
```

## What Persists Automatically

✅ **Memory System** (`.hive-mind/` directory):
- `hive.db` - All collective memory entries
- `memory.db` - Key-value storage
- `config.json` - System configuration
- All implementation history, bug fixes, patterns

✅ **Project State**:
- All code changes (in git)
- Deployment history
- Database schema (in Supabase)

## How to Ensure Continuity

### 1. Opening Statement to Claude
```
"Continue as Queen coordinator for the Cannabis CRM project. 
Load collective memory from .hive-mind/ and resume with full 
agent swarm capabilities. Check memory for latest implementation status."
```

### 2. Memory Verification Command
Ask Claude to run:
```
"Check collective memory status and show latest implementations"
```

Claude will query the SQLite database and confirm all memory is intact.

### 3. Context Recovery Pattern

If you need to ensure full context, say:
```
"Query collective memory for:
- Latest implementations in hive/cannabis-crm/implementation
- Pending tasks in hive/cannabis-crm/requirements  
- Recent deployments in hive/cannabis-crm/deployment
Resume as Queen with agent swarm ready."
```

## Automatic Memory Loading

The Claude Flow system **automatically**:
1. **Detects** `.hive-mind/` directory in project root
2. **Loads** collective memory database on session start
3. **Restores** agent coordination patterns
4. **Maintains** namespace organization

## What You DON'T Need to Do

❌ Re-explain project architecture  
❌ Re-list completed features  
❌ Re-configure agent roles  
❌ Rebuild memory system  

## Best Practice Restart Sequence

```bash
# 1. Start Claude Code in project directory
cd /Users/joshuastokes/Documents/Projects/cake/cake-crm
claude-code

# 2. Initial message to Claude:
"Resume Cannabis CRM project as Queen coordinator with agent swarm. 
Current focus: [describe current task if any]"

# 3. If needed, verify memory:
"Show memory status and last 3 implementations"
```

## Emergency Recovery (If Memory Seems Lost)

If for any reason the memory doesn't auto-load:

```sql
-- The memory is stored in SQLite, you can manually verify:
sqlite3 .hive-mind/hive.db "SELECT * FROM collective_memory WHERE swarm_id LIKE '%cannabis-crm%' ORDER BY timestamp DESC LIMIT 5;"
```

Then tell Claude: "Load collective memory from .hive-mind/hive.db"

## Current Memory Checkpoints

Your memory currently has these key checkpoints:
- **Session**: `swarm-1756828488731-3eq3t3ryt`  
- **Latest Update**: September 3, 2025
- **Implementation Records**: 10+ entries
- **Active Namespaces**: implementation, repairs, deployment, requirements

## Pro Tip for Seamless Continuation

Create a `.claude-context` file in your project root:
```markdown
# Cannabis CRM Project Context
- Role: Queen coordinator with agent swarm
- Memory: .hive-mind/hive.db active
- Latest: Orders table, Sheet components, search/filters
- Stack: Next.js 15, Supabase, TypeScript, ShadCN
- Deploy: Vercel via git push
```

This helps establish context immediately on restart.

## The Magic of Persistent Memory

Unlike typical Claude conversations that reset, your `.hive-mind/` directory ensures:
- **Every implementation** is remembered
- **Every bug fix pattern** is retained  
- **Every deployment** is tracked
- **Every agent learns** from past work

## Memory Namespaces Reference

Your project uses these memory namespaces:
- `hive/cannabis-crm/implementation/` - Completed features and components
- `hive/cannabis-crm/repairs/` - Bug fixes and solutions
- `hive/cannabis-crm/deployment/` - Deployment history and issues
- `hive/cannabis-crm/requirements/` - Pending tasks and features
- `hive/cannabis-crm/architecture/` - Technical architecture decisions
- `hive/cannabis-crm/patterns/` - Code patterns and conventions
- `hive/cannabis-crm/users/` - User management and permissions

## Recent Major Implementations (As of Sept 3, 2025)

✅ **Sheet Components**:
- EditDispensarySheet - Inline dispensary editing
- CommunicationSheet - Logging communications
- OrderSheet - Create/edit orders with dual modes

✅ **Table Conversions**:
- Dispensary directory: Cards → Table with actions
- Orders tab: List → Table with search/filters

✅ **Search & Filters**:
- Orders search by ID, notes, agent name
- Status filtering (All, Pending, Submitted, Approved)
- Real-time filtering within dispensary context

✅ **CRUD Operations**:
- Full edit/delete functionality with confirmations
- Sonner toast notifications
- Order ID editing capability

## Emergency Contact Commands

If you need to rebuild or verify the memory system:

```bash
# Check memory database integrity
sqlite3 .hive-mind/hive.db ".schema"

# List all memory entries
sqlite3 .hive-mind/hive.db "SELECT namespace, key, timestamp FROM collective_memory ORDER BY timestamp DESC;"

# Check swarm configuration
cat .hive-mind/config.json
```

## Summary

**Bottom line**: Just start Claude Code in your project directory, mention you're resuming the Cannabis CRM project, and Claude will have full access to your entire shared history through the collective memory system. No context is lost - every implementation, bug fix, and deployment pattern is preserved and ready for immediate use.

---

*Generated by Claude Code Agent Swarm - September 3, 2025*
*Cannabis CRM Project - Collective Memory System Active*