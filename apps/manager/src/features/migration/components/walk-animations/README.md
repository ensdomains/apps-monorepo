# FrENSday walk renders

Vector Lottie exports from `FrENSday Walk Renders-20260917T182731Z-1-001.zip`.
The game uses the lightweight SVG player; no GIFs or embedded raster assets.

Bittu's tentacle paths are already animated in composition coordinates. Its
After Effects expressions cancel the parent transform, but reference rig layers
that were not exported. The four tentacle layers are therefore unparented with
identity transforms, and expression strings are removed. The body loop is already
covered by the exported keyframes and the player's loop. This preserves the
vector animation without runtime expression evaluation.

LiLi has no JSON export in the archive, so the existing SVG is retained.
