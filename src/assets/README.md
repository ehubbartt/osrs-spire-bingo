# Boss Images

Place your boss images in this folder with the following naming convention:

- `boss-giant-mole.png` - Giant Mole (Floor 1)
- `boss-floor2.png` - Floor 2 boss
- `boss-floor3.png` - Floor 3 boss
- etc.

## Image Requirements:
- Format: PNG or JPG
- Recommended size: 500x400px or similar aspect ratio
- Should be high quality OSRS-style artwork

## To Add a Boss Image:

1. Place the image file in this folder
2. Update the BossFight.svelte component to uncomment the image tag
3. Update the src path to match your image filename

Example:
```svelte
<img src="/src/assets/boss-giant-mole.png" alt={boss.name} class="boss-image" />
```
