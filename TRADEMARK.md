# Trademark Policy

The software in this repository is licensed under the terms in [LICENSE](LICENSE).
Those licenses grant rights in **code**. They grant no rights in ENS Labs'
trademarks, logos, or other brand features. AGPL-3.0 section 7(e) and the MIT
license both leave trademark rights untouched, and this notice makes that
explicit.

You may exercise every right the code licenses give you (use, modify,
redistribute, deploy) without any permission from us. You may not present the
result as ENS, or as endorsed by or affiliated with ENS Labs.

## The marks

- **Word marks:** ENS™, Namechain™
- **Visual marks:** the ENS logo and mark, ENS token icons, and the ENS Labs
  brand system in all colour variants

The full policy, including acceptable uses, uses requiring written permission,
and prohibited uses, is published at:

> https://ens.domains/legal/trademark-guidelines

Brand assets and usage rules (clear space, minimum sizes, colour):

> https://ens.domains/brand

If this notice and the published policy ever disagree, the published policy
governs.

## Brand assets in this repository

The ENS marks are excluded from the code licenses as artwork; see
EXCLUDED: BRAND ASSETS in [LICENSE](LICENSE). Only the artwork is excluded: the
SVG path data that draws a mark, and any raster export of it. The code around it
is licensed normally, so a component that renders a mark is AGPL-3.0-only or MIT
like any other file and you may copy and modify it.

The marks currently live in these files:

```
apps/manager/public/ens-logo.svg
apps/manager/src/assets/ens-mark-badge.svg
apps/manager/src/assets/og/ens-mark.svg
apps/manager/src/assets/migration/ens-v2-logo.svg
apps/manager/src/features/migration/components/success/EnsV2InlineLogo.tsx
apps/portal/public/ens-logo.svg
apps/portal/src/assets/fonts/og/ens-mark.svg
apps/portal/src/assets/logo.tsx
packages/dev-tools/src/EnsMark.tsx
```

Some of these are inline SVG inside `.tsx` files rather than image files, so
unlike the font exclusion in [LICENSE](LICENSE) this cannot be expressed by file
extension. The list is maintained by hand and is a locator, not the definition:
a mark added later is excluded whether or not it appears here.

To build and deploy from this repository, replace the artwork with your own
branding. For the `.tsx` files that means swapping the mark's path data; the
component itself stays under its directory's license and is yours to keep.

## Fonts

The typefaces in this repository are licensed to ENS Labs for its own
deployments and are excluded from both code licenses. See the EXCLUDED: FONTS
section of [LICENSE](LICENSE) for the owners and terms. If you build with them,
you are responsible for obtaining your own license from the foundry.

## Official deployments

**No deployment of this software is official, endorsed, or operated by ENS Labs
unless it is served from one of these origins:**

- https://app.ens.domains
- https://app.ens.dev
- https://explorer.ens.dev

A deployment not listed here is not ours, regardless of how it presents itself,
what domain it uses, or what it claims. We may update this list at any time. The
copy of this file in https://github.com/ensdomains/apps-monorepo is the only
authoritative one; a copy in a fork or a redistributed build does not change it.

If you find a deployment presenting itself as official when it is not, report it
to <legal@ens.domains>.

## Running a modified version

If you distribute or deploy a modified version, you must:

1. **Remove the ENS marks.** Replace the brand assets listed above with your own,
   and remove ENS™ and Namechain™ from the interface, the page title, the
   favicon, metadata, and the name of the service.
2. **Choose a distinct name.** Your name and branding must not be confusingly
   similar to ENS, and must not incorporate "ENS" or "Namechain".
3. **State that you are not us.** Display, where users will see it, wording to
   the effect that your service "is not officially connected to or endorsed by
   ENS Labs".
4. **Mark your changes**, as AGPL-3.0 requires.

You may say factually that your software interacts with, is compatible with, or
is built on the ENS protocol. That is nominative use and needs no permission.
You may not use the marks in your product name, company name, domain name, email
address, or social handle.

## Questions

Licensing enquiries and permission requests: <legal@ens.domains>

---

*This notice describes how ENS Labs' trademark rights interact with the code
licenses in this repository. It is not a grant of any trademark license and does
not limit any right ENS Labs has in its marks.*
