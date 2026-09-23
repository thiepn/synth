# Phase 33 — Project Library, Version History, Backup & Data Resilience

Status: implemented.

## Purpose

Phase 32 made one Synth session durable.

Phase 33 turns that persistence foundation into a user-managed local project library with:

- named restore points
- portable verified backups
- safe duplication/deletion
- cross-tab revision protection
- dependency-aware audio cleanup
- browser-storage visibility

The central rule is:

> No newer project revision or referenced audio dependency may be silently destroyed.

## IndexedDB v2

The database now contains:

~~~text
projects
assets
meta
versions
~~~

The v2 upgrade is additive.

### versions

Named versions are stored separately from current project records.

A version stores:

- version ID
- project ID
- name
- creation timestamp
- source project revision
- complete ProjectDocument snapshot

Audio bytes are not copied into every version.

Versions reference the shared content-addressed assets store through the ProjectDocument asset manifest.

## Named project versions

The active project can create named snapshots.

Before a version is created:

1. dirty project state is saved
2. revision conflicts are checked
3. the clean current ProjectDocument is captured
4. the named version record is stored

Version restore does not rewind database revision counters.

Instead:

~~~text
named historical ProjectDocument
        ↓
hydrate historical musical state
        ↓
preserve current project ID/name/revision baseline
        ↓
mark current project DIRTY
        ↓
next autosave becomes a new current revision
~~~

This preserves history instead of rewriting it.

Named versions can be deleted independently.

Deleting a version triggers dependency-aware audio garbage collection.

## Conflict-safe project writes

Project saves now use optimistic compare-and-save semantics.

Every save supplies the revision it expects to replace.

Inside one IndexedDB read/write transaction:

1. current stored project revision is read
2. actual revision is compared with expected revision
3. mismatch aborts the transaction
4. matching revision writes the next document/assets atomically

A conflict throws ProjectRevisionConflictError.

No last-writer-wins overwrite is performed.

## Cross-tab conflict detection

A BroadcastChannel named:

~~~text
synth-project-sync-v1
~~~

announces successful saves to other tabs.

If another tab reports a newer revision of the active project:

- autosave is paused
- project status becomes CONFLICT
- the remote revision is shown
- local changes remain in memory
- SAVE NOW is disabled in UI
- user can reload the newer stored project
- or SAVE AS to preserve the local tab as a new project

The database revision check remains authoritative even if BroadcastChannel is unavailable.

## Save As during conflicts

SAVE AS no longer requires successfully saving the source project first.

This is intentional.

If Project A has a remote conflict, the user can preserve the current local state as Project B without overwriting Project A.

## Project duplication

Any local project can be duplicated without opening it.

Duplication:

- loads the complete project + referenced assets
- creates a new project ID
- creates new creation/update timestamps
- begins the duplicate at revision 1
- keeps shared content-addressed audio assets deduplicated
- does not switch the active project

Named versions are not duplicated automatically.

## Project deletion

The active project cannot be deleted from the Library.

Inactive project deletion:

- removes its current ProjectDocument
- removes all named versions belonging to that project
- preserves shared audio assets still referenced elsewhere
- runs asset garbage collection afterward

The UI uses a two-click CONFIRM DELETE state instead of an accidental one-click destructive action.

## Dependency-aware audio garbage collection

Audio assets are shared by:

- current projects
- named project versions

Garbage collection scans both stores.

An asset is deleted only when its ID is referenced by neither.

If a corrupt/unsupported project or version record is encountered during the dependency scan, GC fails safe and deletes nothing.

## Synth project backup package

Portable backups use:

~~~text
<project>.synth.zip
~~~

The package contains:

~~~text
manifest.json
project.json
assets.json
assets/<audio-id>.json
assets/<audio-id>.bin
...
~~~

### manifest.json

Includes:

- package format identifier
- package version
- export timestamp
- project ID/name
- asset count
- canonical file names

### project.json

Contains the complete versioned ProjectDocument.

### assets.json

Maps each content-addressed asset ID to:

- metadata JSON path
- raw binary path

### asset metadata

Stores the SampleAssetState with decode status normalized to RAW.

Decoded AudioBuffers are never packaged.

## ZIP safety

Synth uses a dependency-free ZIP store writer/parser.

The parser rejects:

- multi-disk ZIPs
- compressed methods other than STORE
- data-descriptor entries
- excessive entry counts
- excessive total payload
- out-of-bounds central/local headers
- duplicate paths
- absolute paths
- backslash paths
- .. traversal paths
- CRC mismatches

Backup packages therefore cannot write arbitrary filesystem paths or hide compressed payload expansion.

## Audio integrity

Every imported backup audio asset is verified before persistence.

Checks include:

- metadata asset ID format
- metadata/reference ID equality
- byte payload presence
- byte-length consistency
- SHA-256 content hash when present
- content-addressed asset ID equals the first 24 SHA-256 hex characters

A corrupted or tampered asset rejects the entire import.

## Backup export

Backup export loads the persisted project rather than serializing a half-written live state.

For the active project:

- dirty state is saved first
- an unresolved revision conflict blocks backup export if local changes exist

This avoids exporting the wrong side of a conflict.

## Backup import

Backup import:

1. parses and validates the ZIP
2. validates ProjectDocument schema
3. validates asset manifest consistency
4. verifies every audio asset
5. creates a new local project ID
6. starts imported project at revision 1
7. stores project/assets
8. does not overwrite an existing project
9. does not switch active project automatically at the storage layer

The UI opens the successfully imported copy after storage completes.

## Browser storage diagnostics

The project Library displays:

- estimated IndexedDB/site usage
- estimated quota
- whether storage is persistent or best-effort

Where supported, REQUEST PERSISTENT asks the browser for persistent storage.

Failure to grant persistence does not block Synth.

## Library UI

The header project popover now exposes:

### Active project
- saved/unsaved/saving/conflict state
- rename
- Save Now
- Save As

### Conflict recovery
- remote revision notice
- Reload Newer
- guidance to Save As before reload if local changes matter

### Versions
- create named snapshot
- revision/asset count
- restore
- two-click delete

### Local projects
- open
- duplicate
- backup
- two-click delete for inactive projects

### Backup
- export verified .synth.zip
- import verified .synth.zip

### Storage
- usage/quota
- persistence state
- request persistent storage

## Phase boundary

Phase 33 handles durable local data management.

It deliberately does not yet implement:

- installable PWA/service worker/offline app shell
- cloud/account sync
- multi-device merge
- remote collaboration
- arbitrary compressed ZIP import
- long-term schema migration chains
- automated corruption/fault-injection test suites
- storage quota eviction simulation

Those are separate runtime/release-hardening concerns.

## Safety invariants

- newer project revisions are never silently overwritten
- BroadcastChannel is advisory; IndexedDB revision comparison is authoritative
- Save As can preserve conflicted local work
- named versions never mutate current revision history in place
- restoring a version creates new dirty current state
- backups never overwrite an existing project by default
- imported package audio is hash-verified
- ZIP traversal/compression tricks are rejected
- project deletion cannot delete shared assets
- GC deletes nothing if dependency truth cannot be trusted
- active project deletion is blocked
- browser persistent-storage denial is non-fatal
