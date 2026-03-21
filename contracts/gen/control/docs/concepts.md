# OAR Concepts

Generated from `contracts/oar-control-openapi.yaml`.

- OpenAPI version: `3.1.0`
- Contract version: `0.1.0`
- Concepts: `19`

## `access`

- Commands: `5`
- Command IDs:
  - `control.organizations.invites.create`
  - `control.organizations.invites.list`
  - `control.organizations.invites.revoke`
  - `control.organizations.memberships.list`
  - `control.organizations.memberships.update`

## `accounts`

- Commands: `1`
- Command IDs:
  - `control.accounts.passkeys.register.start`

## `billing`

- Commands: `2`
- Command IDs:
  - `control.organizations.create`
  - `control.organizations.update`

## `control-auth`

- Commands: `5`
- Command IDs:
  - `control.accounts.passkeys.register.finish`
  - `control.accounts.passkeys.register.start`
  - `control.accounts.sessions.finish`
  - `control.accounts.sessions.revoke-current`
  - `control.accounts.sessions.start`

## `grants`

- Commands: `2`
- Command IDs:
  - `control.workspaces.launch-sessions.create`
  - `control.workspaces.session-exchange.create`

## `invites`

- Commands: `3`
- Command IDs:
  - `control.organizations.invites.create`
  - `control.organizations.invites.list`
  - `control.organizations.invites.revoke`

## `launch`

- Commands: `2`
- Command IDs:
  - `control.workspaces.launch-sessions.create`
  - `control.workspaces.session-exchange.create`

## `lifecycle`

- Commands: `2`
- Command IDs:
  - `control.organizations.update`
  - `control.provisioning.jobs.get`

## `memberships`

- Commands: `2`
- Command IDs:
  - `control.organizations.memberships.list`
  - `control.organizations.memberships.update`

## `organizations`

- Commands: `9`
- Command IDs:
  - `control.organizations.create`
  - `control.organizations.get`
  - `control.organizations.invites.create`
  - `control.organizations.invites.list`
  - `control.organizations.invites.revoke`
  - `control.organizations.list`
  - `control.organizations.memberships.list`
  - `control.organizations.memberships.update`
  - `control.organizations.update`

## `passkeys`

- Commands: `4`
- Command IDs:
  - `control.accounts.passkeys.register.finish`
  - `control.accounts.passkeys.register.start`
  - `control.accounts.sessions.finish`
  - `control.accounts.sessions.start`

## `plans`

- Commands: `1`
- Command IDs:
  - `control.organizations.usage-summary.get`

## `provisioning`

- Commands: `2`
- Command IDs:
  - `control.provisioning.jobs.get`
  - `control.workspaces.create`

## `quotas`

- Commands: `1`
- Command IDs:
  - `control.organizations.usage-summary.get`

## `registry`

- Commands: `3`
- Command IDs:
  - `control.workspaces.create`
  - `control.workspaces.get`
  - `control.workspaces.list`

## `sessions`

- Commands: `4`
- Command IDs:
  - `control.accounts.passkeys.register.finish`
  - `control.accounts.sessions.finish`
  - `control.accounts.sessions.revoke-current`
  - `control.accounts.sessions.start`

## `tenancy`

- Commands: `4`
- Command IDs:
  - `control.organizations.create`
  - `control.organizations.get`
  - `control.organizations.list`
  - `control.workspaces.list`

## `usage`

- Commands: `1`
- Command IDs:
  - `control.organizations.usage-summary.get`

## `workspaces`

- Commands: `6`
- Command IDs:
  - `control.provisioning.jobs.get`
  - `control.workspaces.create`
  - `control.workspaces.get`
  - `control.workspaces.launch-sessions.create`
  - `control.workspaces.list`
  - `control.workspaces.session-exchange.create`

