# FastFiles QR & Navigation Update

This update adds a local-first QR Code Generator and a grouped burger navigation while preserving the existing file and image workflows.

## Navigation

The main header now exposes a burger menu with three groups:

- File Tools
- Image Tools
- QR Code

The existing drag/drop workflow remains unchanged. Selecting a file/image tool without compatible files opens the existing file picker. QR Generator opens immediately because it does not require a file.

## QR Generator

Supported content types:

- Text
- URL
- Phone
- Email
- SMS
- Wi-Fi (WPA/WEP/open networks, optional hidden-network flag)

Customization:

- live preview
- output size
- margin
- L/M/Q/H error correction
- foreground/background colors
- PNG and SVG downloads
- copy QR image where the browser clipboard API supports image writes
- copy encoded content

QR content is encoded in the browser with no FastFiles backend, account, database, or permanent storage.

## Compatibility

The QR workspace supports FastFiles light/dark/system theme behavior, Thai/English UI, desktop/mobile layouts, and the existing local-first privacy model.
