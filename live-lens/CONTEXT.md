# LiveLens

Guest photo and video sharing for a live event wall and gallery, including wishes to the couple.

## Language

**Share**:
A guest contribution of one or more photos or videos from the camera roll (`/upload`), with an optional name and optional message.
_Avoid_: Upload post, gallery submission, moment (when referring specifically to the share flow)

**Wish**:
A guest contribution captured for the couple (`/wish`), tagged as a wish, with an optional name and message.
_Avoid_: Share (use Share for gallery uploads), greeting, caption-only note

**Collage**:
A single still image baked from two to four photos chosen together in one Share.
_Avoid_: Album, carousel, multi-select set, batch

**Message**:
Optional text attached to a Share or Wish and stored as the media caption; shown as a UI overlay on top of the media.
_Avoid_: Caption (implementation field name), comment, note

**Live mode**:
Which approved media the live wall shows: all media (Normal), videos only (Video), or Wishes only (Wish). Mute default follows the mode (Video starts unmuted; Normal and Wish start muted).
_Avoid_: Live display mode, guest live, live filter

**Live sync**:
Whether every open live wall shows the same slide at the same time via a shared rotation clock; when off, each device advances on its own timer.
_Avoid_: Slide sync, multi-device sync, live mirror

**Data saver**:
A gallery preference that favors smaller image variants; also turns on automatically on slow networks.
_Avoid_: Low quality mode, bandwidth mode
