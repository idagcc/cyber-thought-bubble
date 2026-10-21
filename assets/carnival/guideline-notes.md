# IA03 branding update - 21 October 2026

Source: user-supplied `DGE_Cyber_Pledge_IA03.pdf` (5 pages). Used as visual reference; its Register / Send screens and placeholder copy do not add registration, email collection or pledge submission to the existing photo station.

## Original source assets

The PDF's raster layers were extracted with PyMuPDF, retaining soft-mask transparency. No new generated artwork was required.

- Image 624: original 2730 × 1536 blue/gold tunnel, saved as `public/carnival/backdrop.jpg`.
- Image 627 + soft mask 631: original transparent 1920 × 1080 brand/props layer. Its chrome logo and floating fingerprint, cloud, shield, star and coin were clipped into separate reusable PNGs. Clips exclude neighboring artwork and logo flares.
- Image 1237: original 1920 × 1080 combined carnival illustration. The three visible tent roofs and central flag were clipped into `public/carnival/tents.png`; parts occluded by the logo remain occluded in the source. The lower edge fades on the live UI and meets the photo frame in print.
- `action-frame.svg`: local vector adaptation of the reference's angular cyan/blue button, with a hexagon pattern and corner rails. Text remains accessible HTML.

## Typography

The supplied NotoKufi archive contains an Arabic-only variable font (100–900), an Arabic-only Bold font, and an ExtraBold font containing both scripts. The app uses the original variable file for Arabic and original ExtraBold file for Latin, separated with CSS Unicode ranges under one family. Canvas fonts load both scripts explicitly before certificate rendering. The files are distributed under the SIL Open Font License; copyright strings are taken from their font metadata and the full license ships in `public/fonts/OFL.txt`.

## Layout and behavior

- The center remains a live 16:9 camera; tent branding sits in the top band and decorative props at the sides.
- The inset certificate photo uses the capture's exact aspect ratio. Its frame is shared with print verification through `certificatePhotoFrame`.
- Source PDF placeholder text is not copied into the app. The existing configurable bilingual title and acknowledgement remain editable.
- The original generated files `backdrop.png` and prior generation notes are historical assets; the app now loads the original PDF's `backdrop.jpg`.
