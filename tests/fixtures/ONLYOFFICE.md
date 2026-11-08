# Reference exported by ONLYOFFICE

`onlyoffice-reference.docx` was produced locally on 2026-11-08 by the converter
shipped with ONLYOFFICE Desktop Editors 10.0.0-1 (CachyOS package
`onlyoffice-bin`). The input, `editor-reference.rtf`, specifies the expected
properties independently of DockCheck's OOXML extractor:

- A4: 11906 × 16838 twips; margins left/right/top/bottom 1701/567/1134/1134.
- First paragraph: Times New Roman 14 pt, justified, first-line 709 twips,
  automatic spacing 360/240 = 1.5.
- Second paragraph: Arial 12 pt, left aligned, first-line 0.

Reproduce with an existing installation (not an application dependency):

```sh
/opt/onlyoffice/desktopeditors/converter/x2t tests/fixtures/editor-reference.rtf /tmp/onlyoffice-reference.docx
```

The result was independently read back by the same converter into RTF:

```sh
/opt/onlyoffice/desktopeditors/converter/x2t tests/fixtures/onlyoffice-reference.docx /tmp/onlyoffice-roundtrip.rtf
```

This demonstrates converter interoperability. No GUI opening in Word or
ONLYOFFICE was performed. An attempted PDF render failed in the installed
renderer (`DoctRenderer: error code="open"`); there is no reference image or
confirmed pagination. Do not use this fixture as evidence of Word-compatible
layout, installed font rendering or full editor interoperability.

Hashes:

| Artifact | SHA-256 |
| --- | --- |
| RTF source | a93d7acc8674d55be27f40f97ae7fa0aea3a9e62f368827f4aba60e3c82166dc |
| DOCX fixture | ff5a7a0c4d44ee8f634c48b6a8f92ab88fb54a0b426b7ea005953c63b5b21780 |
| x2t executable | f581243db02ee7ed24da28741a89294911d6dc017377bed72ef3c47e7f15c64f |

The binary fixture is checked in so tests do not require this converter.
