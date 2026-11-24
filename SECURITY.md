# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove e-mail addresses, passwords, session
  tokens and device identifiers first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## How the integration handles your account

- The AC Freedom password is stored by Gladys as a `secret` configuration
  field: it is never sent back to the browser, and the integration never
  writes it to the logs.
- The integration only talks to the AUX cloud servers of the region you
  chose, over HTTPS. The password leaves the container only inside the
  encrypted login request the AC Freedom app itself sends.
- The session token, the user id and the device cookies returned by the
  cloud (which hold the per-device keys) are kept in memory only, and never
  logged.
- Nothing is written to disk.

Using a dedicated AC Freedom account for Gladys, with your units shared to
it, limits what a leaked password could reach.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the AUX / AC Freedom cloud and the AUX devices, which belong to their
manufacturer.
