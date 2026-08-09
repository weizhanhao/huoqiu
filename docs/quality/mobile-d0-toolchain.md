# D0 mobile protected toolchain

The D0 mobile evidence command resolves tools only from the protected registry
at `/opt/huoqiu-quality/mobile-d0/toolchain.v1.json`. There is no `PATH`, home
directory, checkout-local, Corepack, Homebrew, or user SDK fallback. A missing,
malformed, writable, incomplete, version-mismatched, or identity-changed
toolchain produces `D0_MOBILE_NOT_VERIFIED`.

For each protected distribution root, the resolver recursively inventories the
actual directory tree and requires its regular-file paths to equal the
registry component paths exactly. Undeclared adjacent files, writable or
symlinked directories, special files, and escaping file symlinks fail closed.
The pnpm offline store is inside the pnpm closure: every store file is therefore
path-bound and hashed just like the pnpm launcher files.

The exported protected resolver and identity verifier do not inspect a
checkout, `.git`, or the caller's current directory. An outer gate may reuse
them while operating on a detached snapshot without expanding their trust
surface.

Prepared-snapshot execution is still an integration TODO. The existing
`runMobileD0Evidence` entrypoint discovers the commit through `.git` and creates
its own `git archive` snapshot, so an outer capability launcher must not call it
inside an already-detached snapshot. For that integration, this module exports
the resolver/verifier plus pure platform, target-output, Maestro-total, required
tool, version-contract, and fixed-environment helpers. The follow-up executor
must accept the launcher-supplied snapshot root, exact commit, and artifact sink
directly; it must not rediscover Git state or take a second snapshot.

The registry is data, not an executable launch recipe. It cannot supply
`executable`, `prefix_args`, environment variables, or working directories.
Launch shapes are fixed in the resolver:

| Tool      | Entrypoint identity                                        | Actual launch shape                                  |
| --------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| `node`    | `/opt/huoqiu-quality/mobile-d0/node/bin/node`              | the entrypoint directly                              |
| `pnpm`    | `/opt/huoqiu-quality/mobile-d0/pnpm/pnpm.cjs`              | protected Node followed by the fixed `pnpm.cjs` path |
| `adb`     | `/opt/huoqiu-quality/mobile-d0/android/platform-tools/adb` | the entrypoint directly                              |
| `maestro` | `/opt/huoqiu-quality/mobile-d0/maestro/maestro-cli.jar`    | protected Java with `-jar` and the fixed JAR path    |
| `pod`     | `/opt/huoqiu-quality/mobile-d0/ios/bin/pod`                | the protected CocoaPods entrypoint directly          |
| `git`     | `/usr/bin/git`                                             | the entrypoint directly                              |
| `tar`     | `/usr/bin/tar`                                             | the entrypoint directly                              |
| `xcrun`   | `/usr/bin/xcrun`                                           | the entrypoint directly                              |

`pnpm`, `adb`, `maestro`, and `pod` must never point into a service account's home,
the Actions workspace, or another writable directory. The protected external
roots themselves must not be symlinks. A file symlink is accepted only when its
canonical target remains under the same fixed protected component root.
Directories, including `pnpm/store`, must resolve to their exact fixed paths.

## Provision the runner

Use a dedicated, administratively controlled staging directory. Verify vendor
signatures and published archive digests before these commands; do not download
or unpack tools while an evidence job is running.

```sh
sudo install -d -o 0 -g 0 -m 0700 /var/lib/huoqiu-quality/staging
sudo install -d -o 0 -g 0 -m 0755 \
  /opt/huoqiu-quality/mobile-d0 \
  /opt/huoqiu-quality/mobile-d0/node \
  /opt/huoqiu-quality/mobile-d0/pnpm \
  /opt/huoqiu-quality/mobile-d0/pnpm/store \
  /opt/huoqiu-quality/mobile-d0/android/platform-tools \
  /opt/huoqiu-quality/mobile-d0/ios/bin \
  /opt/huoqiu-quality/mobile-d0/java \
  /opt/huoqiu-quality/mobile-d0/maestro

sudo cp -a /var/lib/huoqiu-quality/staging/node/. \
  /opt/huoqiu-quality/mobile-d0/node/
sudo cp -a /var/lib/huoqiu-quality/staging/pnpm/. \
  /opt/huoqiu-quality/mobile-d0/pnpm/
sudo cp -a /var/lib/huoqiu-quality/staging/android-sdk/. \
  /opt/huoqiu-quality/mobile-d0/android/
sudo cp -a /var/lib/huoqiu-quality/staging/ios-support/. \
  /opt/huoqiu-quality/mobile-d0/ios/
sudo cp -a /var/lib/huoqiu-quality/staging/java-runtime/. \
  /opt/huoqiu-quality/mobile-d0/java/
sudo install -o 0 -g 0 -m 0644 \
  /var/lib/huoqiu-quality/staging/maestro-cli.jar \
  /opt/huoqiu-quality/mobile-d0/maestro/maestro-cli.jar

sudo chown -R 0:0 /opt/huoqiu-quality
sudo chmod -R go-w /opt/huoqiu-quality
sudo chmod 0755 \
  /opt/huoqiu-quality/mobile-d0/node/bin/node \
  /opt/huoqiu-quality/mobile-d0/android/platform-tools/adb \
  /opt/huoqiu-quality/mobile-d0/ios/bin/pod \
  /opt/huoqiu-quality/mobile-d0/java/bin/java
sudo chmod 0644 \
  /opt/huoqiu-quality/mobile-d0/pnpm/pnpm.cjs \
  /opt/huoqiu-quality/mobile-d0/maestro/maestro-cli.jar
```

The Node, pnpm, Android SDK/Gradle seed, Java, Maestro, and CocoaPods/cache-seed
artifacts must be the reviewed distributions for this runner.
`maestro-cli.jar` must be a directly runnable, dependency-complete CLI JAR. If
Node, pnpm, Java, Maestro, adb, or pod loads separate distribution files, every
one of those files is a registry component. OS-owned loader libraries and the
Xcode bundle selected by the fixed `DEVELOPER_DIR` are part of the pinned runner
base-image trust boundary; tool-distribution files are not.

The Android tree must contain
`gradle-home-seed/.huoqiu-reviewed`; the iOS support tree must contain
`native-home-seed/.huoqiu-reviewed`. The protected launcher copies those
fully-hashed seed trees into its private `/var/empty` view before execution.
They are not shared writable host caches.

The command fixes `NODE` and `npm_node_execpath` to the protected Node binary,
places only the protected Node and Java bins ahead of `/usr/bin:/bin`, fixes
`JAVA_HOME`, adds the protected CocoaPods bin on iOS, and selects either the protected `ANDROID_HOME` /
`ANDROID_SDK_ROOT` or the image-pinned Xcode `DEVELOPER_DIR`. Expo is launched
by the protected Node directly at
`apps/mobile/node_modules/expo/bin/cli`; it is never reached through a
candidate `.bin/node` or `pnpm exec expo` shim.

Populate the pnpm store in a separate protected provisioning phase using the
exact reviewed `pnpm-lock.yaml`. Network access is allowed only in that phase.
The evidence command later uses `--offline`, the fixed store path, and
`--strict-peer-dependencies` with `--package-import-method=copy`; it never
writes through a hard link into the protected store.

```sh
cd /var/lib/huoqiu-quality/staging/reviewed-source
sudo env -i \
  CI=1 HOME=/var/empty LANG=C LC_ALL=C PATH=/usr/bin:/bin TMPDIR=/tmp \
  /opt/huoqiu-quality/mobile-d0/node/bin/node \
  /opt/huoqiu-quality/mobile-d0/pnpm/pnpm.cjs \
  fetch --frozen-lockfile \
  --store-dir /opt/huoqiu-quality/mobile-d0/pnpm/store \
  --config.verify-store-integrity=true \
  --config.side-effects-cache=false

sudo chown -R 0:0 /opt/huoqiu-quality/mobile-d0/pnpm/store
sudo chmod -R go-w /opt/huoqiu-quality/mobile-d0/pnpm/store
```

## Build the registry

Record the exact trimmed output of each version probe. The value may contain
LF-separated printable ASCII lines (for example, `adb version` and GNU tar can
be multiline), but no other control characters. It must also satisfy the
repository's built-in version contract (`pnpm` 11.4.0 and Node 24.15.x remain
mandatory).

```sh
sudo env -i HOME=/var/empty LANG=C LC_ALL=C PATH=/usr/bin:/bin TMPDIR=/tmp \
  /opt/huoqiu-quality/mobile-d0/node/bin/node --version
sudo env -i HOME=/var/empty LANG=C LC_ALL=C PATH=/usr/bin:/bin TMPDIR=/tmp \
  /opt/huoqiu-quality/mobile-d0/node/bin/node \
  /opt/huoqiu-quality/mobile-d0/pnpm/pnpm.cjs --version
sudo env -i HOME=/var/empty LANG=C LC_ALL=C PATH=/usr/bin:/bin TMPDIR=/tmp \
  /opt/huoqiu-quality/mobile-d0/android/platform-tools/adb version
sudo env -i HOME=/var/empty LANG=C LC_ALL=C PATH=/usr/bin:/bin TMPDIR=/tmp \
  /opt/huoqiu-quality/mobile-d0/java/bin/java -jar \
  /opt/huoqiu-quality/mobile-d0/maestro/maestro-cli.jar --version
sudo env -i HOME=/var/empty LANG=C LC_ALL=C PATH=/usr/bin:/bin TMPDIR=/tmp \
  /opt/huoqiu-quality/mobile-d0/ios/bin/pod --version
/usr/bin/git --version
/usr/bin/tar --version
/usr/bin/xcrun --version
```

Generate lowercase SHA-256 values for every component. For composite tools,
the inventory must contain the launcher, fixed entrypoint, and every separate
runtime or distribution file that either can load. Include every file below
`/opt/huoqiu-quality/mobile-d0/pnpm/store` in the pnpm component list. Lockfile
integrity remains defense in depth; it does not replace the resolver's store
path, ownership, permission, and digest checks.

```sh
/usr/bin/shasum -a 256 /usr/bin/git /usr/bin/tar /usr/bin/xcrun
sudo find /opt/huoqiu-quality/mobile-d0/node \
  \( -type f -o -type l \) -exec /usr/bin/shasum -a 256 {} +
sudo find /opt/huoqiu-quality/mobile-d0/pnpm \
  \( -type f -o -type l \) -exec /usr/bin/shasum -a 256 {} +
sudo find /opt/huoqiu-quality/mobile-d0/android \
  \( -type f -o -type l \) -exec /usr/bin/shasum -a 256 {} +
sudo find /opt/huoqiu-quality/mobile-d0/java \
  \( -type f -o -type l \) -exec /usr/bin/shasum -a 256 {} +
sudo find /opt/huoqiu-quality/mobile-d0/ios \
  \( -type f -o -type l \) -exec /usr/bin/shasum -a 256 {} +
/usr/bin/shasum -a 256 \
  /opt/huoqiu-quality/mobile-d0/maestro/maestro-cli.jar
```

Materialize the following exact JSON shape in the root-only staging directory.
Each `<sha256>` is 64 lowercase hexadecimal characters. The abbreviated
component arrays below are structural examples: installation is invalid until
all transitive distribution files described above have individual entries.

```json
{
  "schema_version": 1,
  "tools": {
    "git": {
      "expected_version": "git version <exact>",
      "components": [{ "path": "/usr/bin/git", "sha256": "<sha256>" }]
    },
    "tar": {
      "expected_version": "<exact complete tar version output>",
      "components": [{ "path": "/usr/bin/tar", "sha256": "<sha256>" }]
    },
    "xcrun": {
      "expected_version": "xcrun version <exact>",
      "components": [{ "path": "/usr/bin/xcrun", "sha256": "<sha256>" }]
    },
    "node": {
      "expected_version": "v24.15.<patch>",
      "components": [
        {
          "path": "/opt/huoqiu-quality/mobile-d0/node/bin/node",
          "sha256": "<sha256>"
        }
      ]
    },
    "pnpm": {
      "expected_version": "11.4.0",
      "components": [
        {
          "path": "/opt/huoqiu-quality/mobile-d0/node/bin/node",
          "sha256": "<sha256>"
        },
        {
          "path": "/opt/huoqiu-quality/mobile-d0/pnpm/pnpm.cjs",
          "sha256": "<sha256>"
        },
        {
          "path": "/opt/huoqiu-quality/mobile-d0/pnpm/store/<every-file>",
          "sha256": "<sha256>"
        }
      ]
    },
    "pod": {
      "expected_version": "<exact CocoaPods version>",
      "components": [
        {
          "path": "/opt/huoqiu-quality/mobile-d0/ios/bin/pod",
          "sha256": "<sha256>"
        },
        {
          "path": "/opt/huoqiu-quality/mobile-d0/ios/native-home-seed/.huoqiu-reviewed",
          "sha256": "<sha256>"
        }
      ]
    },
    "adb": {
      "expected_version": "<exact complete adb version output>",
      "components": [
        {
          "path": "/opt/huoqiu-quality/mobile-d0/android/platform-tools/adb",
          "sha256": "<sha256>"
        },
        {
          "path": "/opt/huoqiu-quality/mobile-d0/android/gradle-home-seed/.huoqiu-reviewed",
          "sha256": "<sha256>"
        }
      ]
    },
    "maestro": {
      "expected_version": "<exact Maestro version>",
      "components": [
        {
          "path": "/opt/huoqiu-quality/mobile-d0/java/bin/java",
          "sha256": "<sha256>"
        },
        {
          "path": "/opt/huoqiu-quality/mobile-d0/maestro/maestro-cli.jar",
          "sha256": "<sha256>"
        }
      ]
    }
  }
}
```

Install the finished registry atomically and remove all group/other write bits.
Never place a temporary registry inside the repository or a home directory.

```sh
sudo install -o 0 -g 0 -m 0444 \
  /var/lib/huoqiu-quality/staging/toolchain.v1.json \
  /opt/huoqiu-quality/mobile-d0/.toolchain.v1.json.new
sudo mv -f \
  /opt/huoqiu-quality/mobile-d0/.toolchain.v1.json.new \
  /opt/huoqiu-quality/mobile-d0/toolchain.v1.json

test "$(realpath /opt/huoqiu-quality/mobile-d0)" = \
  /opt/huoqiu-quality/mobile-d0
case "$(realpath /opt/huoqiu-quality/mobile-d0/toolchain.v1.json)" in
  /opt/huoqiu-quality/mobile-d0/*) ;;
  *) exit 1 ;;
esac
test -z "$(find /opt/huoqiu-quality ! -user root -print)"
test -z "$(find /opt/huoqiu-quality \( -perm -020 -o -perm -002 \) -print)"
```

When any tool byte, offline-store byte, separate dependency, or exact version
changes, regenerate the complete affected component list in staging and
reinstall the whole registry. Do not edit the live file in place. The resolver
records the registry identity and every component identity, then re-inventories
and re-hashes them before and after every tool execution; an observed in-flight
rotation therefore fails closed rather than mixing two toolchain generations.

## Runner validation

Run Android and iOS only through the root-signed external verifier and protected
OS launcher described in `docs/engineering/quality-trust-model.md`. That
launcher must enforce the exact
`container-v1:no-network,read-only-source,owned-process-tree` profile, expose a
writable private snapshot and artifact mount, provide image-pinned offline
Gradle/CocoaPods/native caches, and clean every descendant. The original source
mount remains read-only. An environment variable cannot prove this boundary.

The commands below are diagnostics only. Running them directly can test runner
provisioning, but their raw output is never certification evidence:

```sh
pnpm e2e:mobile:d0:android
pnpm e2e:mobile:d0:ios
```

The final gate accepts a mobile raw report only when the outer protected
launcher binds it to the exact commit, tracked-source digest, toolchain
registry, and isolation profile. If the protected image cannot supply a pinned
Android Gradle distribution/cache or the pinned Xcode/CocoaPods inputs needed
by Expo's native child processes, native build/launch must fail and the platform
must remain `NOT_VERIFIED`; do not add a host `PATH`, home, or checkout-local
fallback.

A host lacking the protected registry or any platform-required entry must exit
non-zero, print `D0_MOBILE NOT_VERIFIED`, and write `summary.json` with
`"verified": false`. Treat that as an installation blocker, never as evidence.
