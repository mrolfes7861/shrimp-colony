"""Copies just the files the game needs into a clean folder for itch.io.
Usage: python tools/itch_build.py [folder]
Then push that folder with butler; the command is printed at the end."""
import os
import shutil
import sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else "F:/Dev/shrimp-colony-itch/html5"

# Only ever clear a folder this script made.
if os.path.isdir(out):
    if not os.path.isfile(os.path.join(out, "index.html")):
        sys.exit(f"{out} exists and is not an earlier build; not touching it")
    shutil.rmtree(out)
os.makedirs(out)
shutil.copy2(os.path.join(root, "index.html"), out)
shutil.copytree(os.path.join(root, "js"), os.path.join(out, "js"))

count = sum(len(files) for _, _, files in os.walk(out))
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, files in os.walk(out) for f in files)
print(f"{count} files, {size // 1024} KB in {out}")
print(f'Push with: F:/Dev/Tools/butler/butler.exe push "{out}" drangus7861/shrimp-colony:html5 --userversion X')
