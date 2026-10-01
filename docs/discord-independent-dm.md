# Discord alerts without a shared server

Reviewed 2026-10-01. No change to production OAuth scopes or recipient restrictions.

## Publicly supported paths

- User-installable apps can expose commands in DMs and other supported contexts without requiring installation in a shared guild. They are a viable route for an on-demand `/offers` or `/wishlist` command, not a documented guarantee of unsolicited daily notification delivery.
- Interaction follow-ups use tokens valid for 15 minutes, with an initial response required within 3 seconds. They cannot be stored and reused as an indefinite daily-alert subscription.
- The public OAuth scope reference does not document `dm_channels.messages.write` as an available general-purpose scope. Do not use undocumented/internal endpoints or automate a normal user account to work around Discord limits.
- A user can choose a personal-server installation containing the bot, but this still requires a shared guild and adds a more complicated setup than joining SHUX.

## Recommendation

Keep optional shared-server bot MD delivery plus email/push for now. If independent delivery is essential, ask Discord Developer Support whether they offer an approved app-to-user notification flow for this use case before promising or building it. A user-installed on-demand command is a separate, feasible feature but does not replace automatic notifications.

Official references:
- https://docs.discord.com/developers/tutorials/developing-a-user-installable-app
- https://docs.discord.com/developers/interactions/receiving-and-responding
- https://docs.discord.com/developers/topics/oauth2
