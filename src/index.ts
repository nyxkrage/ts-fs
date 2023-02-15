type FsFile = {
  contents: string,
  type: "file",
};
type FsDirectory = {
  contents: FsNode[],
  type: "directory",
};

type FsNode = (FsFile | FsDirectory) & FsMetadata;

type FsPermission = {
  read: boolean,
  write: boolean,
  execute: boolean,
};

type FsPermissions = {
  user: FsPermission,
  group: FsPermission,
  other: FsPermission,
}

type FsMetadata = {
  name: string | null,
  owner: {
    user: FsUser,
    group: FsGroup,
  },
  permissions: {
    user: FsPermission,
    group: FsPermission,
    other: FsPermission,
  },
  modified: Date,
};

type FsUser = {
  name: string,
  uid: number,
  gid: number,
  groups: number[]
};

type FsGroup = {
  name: string,
  gid: number,
};

const defaultPermissions: {
  DIRECTORY: FsPermissions,
  FILE: FsPermissions,
} = {
  DIRECTORY: {
    user: {
      read: true,
      write: true,
      execute: true,
    },
    group: {
      read: true,
      write: true,
      execute: true,
    },
    other: {
      read: true,
      write: false,
      execute: true,
    },
  },
  FILE: {
    user: {
      read: true,
      write: true,
      execute: false,
    },
    group: {
      read: true,
      write: true,
      execute: false,
    },
    other: {
      read: true,
      write: false,
      execute: false,
    },
  },
};

export const fsGroups: Record<number, FsGroup> = {
  0: {
    name: "root",
    gid: 0,
  },
  1000: {
    name: "nyx",
    gid: 1000,
  },
};
export const fsUsers: Record<number, FsUser> = {
  0: {
    name: "root",
    uid: 0,
    gid: 0,
    groups: [],
  },
  1000: {
    name: "nyx",
    uid: 1000,
    gid: 1000,
    groups: [],
  },
};

function FsPermissions(permissions: string | number | FsPermissions) {
  let perms = undefined;
  if (typeof permissions === "string") {
    perms = permissions.split('').map(Number);
  } else if (typeof permissions === "number") {
    perms = [
      (0o655) & 0o7,
      (0o655 >> 3) & 0o7,
      (0o655 >> 6) & 0o7,
    ];
  } else {
    return permissions
  }
  return {
    user: {
      read: (perms[0] & 4) == 1,
      write: (perms[0] & 2) == 1,
      execute: (perms[0] & 1) == 1,
    },
    group: {
      read: (perms[1] & 4) == 1,
      write: (perms[1] & 2) == 1,
      execute: (perms[1] & 1) == 1,
    },
    other: {
      read: (perms[2] & 4) == 1,
      write: (perms[2] & 2) == 1,
      execute: (perms[2] & 1) == 1,
    },
  };
}

export function FsDirectory(name: string | null, files?: FsNode[], owner?: FsUser, permissions?: string | number | FsPermissions) {
  if (owner === undefined) {
    owner = env.user;
  }

  permissions = FsPermissions(permissions ?? defaultPermissions["DIRECTORY"]);

  return {
    name: name,
    contents: files ?? [],
    owner: {
      user: owner,
      group: fsGroups[owner.gid],
    },
    permissions: permissions,
    modified: new Date(),
    type: "directory",
  } as const satisfies FsNode;
}
export function FsFile(name: string | null, content?: string, owner?: FsUser, permissions?: string | number | FsPermissions) {
  if (owner === undefined) {
    owner = env.user;
  }

  permissions = FsPermissions(permissions ?? defaultPermissions["DIRECTORY"]);

  return {
    name: name,
    contents: content ?? "",
    owner: {
      user: owner,
      group: fsGroups[owner.gid],
    },
    permissions: permissions,
    modified: new Date(),
    type: "file",
  } as const satisfies FsNode;
}

interface Fs {
  resolve(path: Path): FsNode | undefined,
  root: FsNode,
}
function Fs(root: FsNode): Fs {
  return {
    resolve(path) {
      const parts = path.parts();
      let currentNode: FsNode = this.root;

      for (let i = 0; i < parts.length + 1; i++) {
        if (i == parts.length) {
          return currentNode
        }
        if (currentNode.type === "file") {
          // otherwise invalid path
          return
        }
        let nodeFound = false;
        for (const node of currentNode.contents) {
          if (node.name === parts[i]) {
            currentNode = node;
            nodeFound = true;
            break
          }
        }
        if (!nodeFound) {
          return
        }
      }
    },
    root,
  }
}

interface Path {
  path: string
  canonicalize(): Path,
  isAbsolute(): boolean,
  parts(): string[],
  append(part: string | Path): Path,
  toString(): string,
}
export function Path(path: string): Path {
  return {
    path,
    canonicalize() {
      let res = [];
      let tmp = this;
      if (!this.isAbsolute()) {
        tmp = env.cwd.append(this)
      }

      const parts = tmp.parts();

      for (let part of parts) {
        if (part === "..") {
          res.pop();
          continue;
        }

        if (part === ".") {
          continue;
        }

        res.push(part);
      }

      return Path("/" + res.join("/"))
    },
    isAbsolute() {
      return this.path.startsWith("/");
    },
    parts() {
      return this.path.split("/").filter(v => v);
    },
    append(part) {
      if (typeof part !== "string") {
        part = part.toString()
      }

      if (this.path.endsWith("/")) {
        return Path(this.path + part)
      } else {
        return Path(this.path + "/" + part)
      }
    },
    toString() {
      return this.path
    }
  }
}

type Env = {
  cwd: Path,
  user: FsUser,
  env: Record<string, string>
}
function Env(uid: number): Env {
  const user = fsUsers[uid];
  const home = Path("/home").append(user.name);
  return {
    user,
    cwd: home,
    env: {
      "HOME": home.toString(),
      "PWD": home.toString(),
      "TMPDIR": "/tmp",
      "PS1": "[%u@%h:%p]$ ",
      "PATH": "/bin"
    },
  }
}
export const env = Env(1000);
export const fs = Fs(
  FsDirectory(null, [
    FsDirectory("bin", [
      FsFile("tree", "bins.tree(fs.resolve(Path($@.join()).canonicalize()))")
    ], fsUsers[0]),
    FsDirectory("home", [
      FsDirectory("nyx", [
          FsDirectory("some dir", [
            FsDirectory("another dir", [
              FsFile("Hello World", "Wow thats a lot of spaces"),
              FsFile("NoSpace", "Wow thats a lot of spaces")
            ]),
            FsDirectory("oops, all dir", [
              FsFile("nodir", "Wow thats a lot of spaces"),
              FsFile("even-some-hypens", "Wow thats a lot of spaces")
            ]),
          ]),
        FsDirectory(".config", [
          FsDirectory("nvim", [
            FsFile("init.lua", "Check ../emacs/init.el")
          ]),
          FsDirectory("emacs", [
            FsFile("init.el", "(load-theme 'catppuccin t)")
          ])
        ]),
        FsFile("user.txt", "Hello World!"),
      ])
    ], fsUsers[0]),
    FsDirectory("root", [
      FsFile("root.txt", "Hello R00t!"),
    ], fsUsers[0], 0o770),
  ], fsUsers[0])
)

function tree(node: FsNode) {
  function _tree(node: FsNode, depthBuf: string[]) {
    if (node.type == "file") {
      return;
    }
    for (let i = 0; i < node.contents.length; i++) {
      const file = node.contents[i];

      let char = i == node.contents.length - 1 ? '`' : '|'
      if (file.type == "file") {
        console.log(`${depthBuf.join("  ")}${char}--${file.name}`)
      } else {
        console.log(`${depthBuf.join("  ")}${char}--${file.name}/`)
        _tree(file, [...depthBuf, char == '`' ? ' ' : '|', ])
      }
    }

  }
  console.log(node.name ?? "/");
  if (node.type == "file") {
    return;
  }
  for (let i = 0; i < node.contents.length; i++) {
    const file = node.contents[i];
    let char = i == node.contents.length - 1 ? '`' : '|'
    if (file.type == "file") {
      console.log(`${char}--${file.name}`)
    } else {
      console.log(`${char}--${file.name}/`)
      _tree(file, [char == '`' ? ' ' : '|', ''])
    }
  }
}
function cat(path: Path) {
  const node = fs.resolve(path.canonicalize());

  if (node?.type == "file") {
    console.log(node.contents);
  }
}
const terminal = document.getElementById("terminal")!;
function print(...args: any[]) {
  terminal.innerText += args.toString()
}

declare global {
  interface Window {
    fs: Fs,
    env: Env,
    Path: typeof Path,
    fsGroups: typeof fsGroups,
    fsUsers: typeof fsUsers,
    FsDirectory: typeof FsDirectory,
    FsFile: typeof FsFile,
    bins: Record<string, (...args: any) => any>
  }
}
function handleCommand(v: string) {
  let part = "";
  let res = [];
  let quoted = false;

  for (let i = 0; i < v.length; i++) {
    let char = v[i];
    if (char === '"' && v[i - 1] !== '\\') {
      quoted = !quoted;
      continue;
    }

    if (char === ' ' && quoted !== true) {
      res.push(part);
      part = "";
      continue;
    }

    part += char;
  }
  res.push(part);
  let [cmd, ...args] = res;

  for (let path of env.env.PATH.split(":")) {
    let node = fs.resolve(Path(path));
    if (node?.type === "directory") {
      let exe = node.contents.find(f => f.name === cmd);
      if (!exe || exe.type !== "file") {
        return
      }
      console.log(`Output of ${cmd} with args ${args}`)
      eval(exe.contents.replaceAll("$@", '[' + args.map(v => '"' + v + '"').join(",") + ']'))
    }
  }
}

document.getElementById("prompt")?.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    handleCommand((e.target as HTMLInputElement).value)
  }
});


window.fs = fs;
window.env = env;
window.Path = Path;
window.fsGroups = fsGroups;
window.fsUsers = fsUsers;
window.FsDirectory = FsDirectory;
window.FsFile = FsFile;
window.bins= { tree, cat };
