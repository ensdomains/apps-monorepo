/**
 * Downscale avatar bitmaps before they reach satori/resvg (WEB-1218).
 *
 * The OG card draws the avatar into a fixed 140×140 slot, but the bitmap satori
 * hands resvg is decoded at its *source* resolution — a 4000×4000 avatar is
 * 64 MB of pixels however small it ends up on the card. resvg runs in a WASM
 * instance whose linear memory is a per-isolate singleton that only ever grows,
 * so past a certain size the render throws, `renderOgResponse` reports `null`,
 * and the card degrades to the initial-letter tile: the name silently loses its
 * avatar in every link preview.
 *
 * The byte cap in `ens.ts` doesn't prevent that — it bounds the *encoded*
 * payload, and decoded area has no fixed relationship to it (a flat-colour PNG
 * compresses on the order of 1000:1). Pixels are what has to be capped, so the
 * image is resized through the Cloudflare Images binding before it is ever
 * embedded.
 *
 * The same pass also normalises the format, which fixes a second failure the
 * ticket didn't ask about. satori 0.15 measures an image by sniffing its magic
 * bytes, and only PNG, APNG, JPEG, GIF and SVG are in its accepted list: a WebP
 * or AVIF avatar throws there and takes the card down whatever its size. Those
 * exist in the wild today (`luc.eth` is WebP), so re-encoding rescues them.
 */

/**
 * Longest edge we keep.
 *
 * The card's avatar slot is 140 px inside a 1200×630 raster rendered 1:1, so 2×
 * leaves headroom for the `object-fit: cover` crop (and for the slot growing)
 * while still capping the decode at 280×280×4 ≈ 313 KB.
 */
const AVATAR_MAX_PX = 280

/**
 * Only applies to the JPEG branch. 85 is the usual visually-lossless knee, and
 * at 280 px the artefacts a lower setting would buy us bytes with are plainly
 * visible in a preview card.
 */
const JPEG_QUALITY = 85

/** Image bytes plus the media type they should be labelled with. */
export interface AvatarBitmap {
  readonly bytes: Uint8Array
  readonly contentType: string
}

/**
 * An avatar to downscale: either raw bytes (a fetched avatar) or the base64
 * text of a `data:` URI (an on-chain one), which the binding decodes itself.
 */
export interface AvatarSource {
  readonly data: Uint8Array | string
  readonly contentType: string
  readonly encoding?: 'base64'
}

/**
 * Vector avatars are left alone: there is no pixel budget to cap, Cloudflare
 * Images "does not resize SVG files and will ignore any optimization
 * parameters", and satori rasterises SVG itself at the size the card draws it.
 */
function isVector(contentType: string): boolean {
  return contentType === 'image/svg+xml'
}

/**
 * A JPEG source has no alpha channel to lose, and staying lossy keeps a
 * photographic avatar an order of magnitude smaller than the PNG re-encode
 * would. Everything else — PNG, GIF, WebP, AVIF, HEIC — may be transparent, so
 * it lands on PNG, where flattening can't turn a cut-out avatar into a black
 * box.
 */
function outputFormat(contentType: string): 'image/jpeg' | 'image/png' {
  return contentType === 'image/jpeg' ? 'image/jpeg' : 'image/png'
}

/** Wrap a single buffer as the one-chunk stream the binding takes as input. */
function toStream(data: Uint8Array | string): ReadableStream<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

/**
 * Resize an avatar to {@link AVATAR_MAX_PX} and re-encode it into a format
 * satori can read.
 *
 * Returns `null` whenever the image is left as-is — no binding configured, a
 * vector source, or a transform the Images service refused (a corrupt or
 * unsupported input, an account without Images enabled). Callers fall back to
 * the original bytes, which is exactly today's behaviour, so a failure here can
 * only cost us the optimisation and never the card.
 */
export async function downscaleAvatar(
  images: ImagesBinding | undefined,
  source: AvatarSource,
): Promise<AvatarBitmap | null> {
  const contentType = source.contentType.toLowerCase()
  if (!images || isVector(contentType)) return null

  try {
    const result = await images
      .input(toStream(source.data), { encoding: source.encoding })
      // `scale-down` caps the longest edge without ever enlarging, so an avatar
      // that is already small keeps its own resolution instead of being blown
      // up to the target and re-encoded at a loss.
      .transform({
        width: AVATAR_MAX_PX,
        height: AVATAR_MAX_PX,
        fit: 'scale-down',
      })
      // `anim: false` flattens animated GIF/WebP to their first frame: resvg
      // can't animate anyway, and decoding every frame is the memory blowup
      // this module exists to avoid.
      .output({
        format: outputFormat(contentType),
        quality: JPEG_QUALITY,
        anim: false,
      })

    const bytes = new Uint8Array(
      await new Response(result.image()).arrayBuffer(),
    )

    return { bytes, contentType: result.contentType() }
  } catch {
    return null
  }
}
