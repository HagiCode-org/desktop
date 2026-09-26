# Direct package downloads

Desktop downloads indexed packages over HTTP(S). When an index provides both
official and GitHub Release sources, Desktop selects their order using the
effective service region; without a service-region preference, its existing
locale detection is used, with official-first ordering when detection is
unavailable.

If a source fails, Desktop removes any partial archive before trying the next
available source. A published SHA-256 digest is checked before installation or
reuse of a downloaded archive. Local-folder package installation remains
available.

Desktop no longer downloads from peers, seeds packages, or offers sharing
acceleration settings or onboarding choices. Previously saved sharing
preferences are ignored and are not migrated or deleted.
