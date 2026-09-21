# Commemorative NFT sharing and downloads

The Manager builds a public URL for the connected owner's token:

```
{VITE_COMMEMORATIVE_NFT_RENDERER_ORIGIN}/nft/?tokenId={keccak256(ownerAddress)}
```

The URL opens the hosted, token-specific renderer. The token ID is derived in
`config.ts`; it is not the ENS name or the address itself. The share target is
the same after minting and when the card is reopened from the dashboard. The
metadata endpoint and persistent image are on the configured asset origin:

```
{VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN}/token/{tokenId}.json
{VITE_COMMEMORATIVE_NFT_ASSET_ORIGIN}/token/{tokenId}/image.webp
```

The metadata can also contain `animation_url`, which points to a hosted
renderer page. It does not represent a downloadable video. The Download WebP
control fetches the published image and saves it as
`ensv2-commemorative-nft.webp`. The asset host must allow cross-origin `GET`
from the Manager for this browser download to work. A published sample image
returned HTTP 200, `image/webp`, and `Access-Control-Allow-Origin: *` on
September 21, 2026.

| Action | What the user sees |
| --- | --- |
| X | The X composer opens with the card sentence and public URL. The user can edit and post it. |
| Telegram | A chat chooser opens with the public URL and editable card sentence. |
| Discord | The card sentence and URL are copied to the clipboard, then Discord opens. The user chooses a conversation and pastes the message. |
| Copy link | The public URL alone is copied. |
| Download WebP | The persistent image is saved locally. |

The default minted sentence is “Upgraded to ENSv2 and minted my card.” The
preview sentence does not claim a mint. Notable-trait copy is intentionally not
selected because the proposed trait ranking does not match the currently
published five renderer traits. Product can approve a mapping and sentence
before a trait-specific share is added.

X and Telegram support URL-based prefilled shares. Discord's public website
does not offer an equivalent URL intent for an arbitrary external page, so
the Discord control uses an explicit copy-and-paste handoff. The Web Share API
could invoke a device share sheet, but the website cannot choose Discord as
its destination. None of these actions submits a post on the user's behalf.

The renderer URL responded with HTTP 200 on September 21, 2026, but its server
HTML contained only a generic page title. It did not include token-specific
Open Graph or X image metadata. The Manager supplies text and a link, so X,
Telegram, and Discord may show a plain link or generic preview instead of a
card image. Rich image previews require server-readable metadata on the
renderer URL for each token.

Platform references: [X post button](https://help.x.com/en/using-x/add-x-share-button),
[Telegram share button](https://core.telegram.org/widgets/share),
[Discord link previews](https://support.discord.com/hc/en-us/articles/42500550752919-About-Discord-Link-Previews-and-the-Discordbot),
[Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share).
