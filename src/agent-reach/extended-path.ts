/** Build PATH that includes common user-install locations for pip/brew binaries. */
export function extendedPythonPath(): string {
  const home = process.env.HOME ?? "";
  const extra = [
    `${home}/Library/Python/3.9/bin`,
    `${home}/Library/Python/3.10/bin`,
    `${home}/Library/Python/3.11/bin`,
    `${home}/Library/Python/3.12/bin`,
    `${home}/Library/Python/3.13/bin`,
    `${home}/Library/Python/3.14/bin`,
    `${home}/.local/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  return `${extra.join(":")}:${process.env.PATH ?? ""}`;
}
