# Security Policy

## Scope

This library communicates with 3D printers over a local area network using the same protocol as the official Elegoo applications. It does not handle authentication tokens, cloud credentials, or any data beyond what is needed to communicate with the printer.

Relevant security concerns would include:

- Unintended commands being sent to a printer (e.g. temperature changes, axis movement)
- Exposure of the printer access code through logs or error messages
- Denial-of-service against the printer's MQTT broker

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report them privately via [GitHub Security Advisories](../../security/advisories/new) or by emailing the maintainer directly (see the npm package page for contact info).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- The version(s) affected

You can expect an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues.
