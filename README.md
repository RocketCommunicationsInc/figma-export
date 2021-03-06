# figma-export-icons

 > Command line script to export and download Astro's icons from a Figma file using the Figma REST api.

## Description

 Running the script will bring up a wizard to fill in the config for fetching the assets. You can also provide the icons-config.json yourself, then the wizard is skipped.
 After the config is provided, the figma file is fetched and parsed to find the icons frame, the files are downloaded and put locally in the directory provided in the config.

 example config file:

 ```json
{
  "figmaPersonalToken": "YOUR_PERSONAL_TOKEN",
  "fileId": "FILE_ID",
  "page": "Identity",
  "frame": "Icons",
  "iconsPath": "assets/svg/icons",
  "metaPath": "assets/svg/icons",
  "removeFromName": "Icon="
}
```

## Features

 - Wizard to generate config, you will be prompted for any missing key
 - icons-config.json is automatically added to .gitignore if it exists
 - Directory to save the icons is created if it doesn't exist
 - Icons are deleted from local directory when fetching new
 - Icons with the same name are marked with `${iconName}-duplicate-name.svg` so you can easily spot them and fix figma file
 - Running the script with `-c` will clear the config and run the wizard again
 - You can use a custom path to your configuration file with `--config=path/to/config.json`
 - `frame` can be a path if your icons are nested, e.g. `frame="Atoms/icons"`

 ## Installation

 Install the cli globally so you can use it on any directory

 ```sh
 npm install -g @astrouxds/figma-export
```

 Or if you prefer install it in your project

```sh
npm install @astrouxds/figma-export --save
```

## Usage

If you're running from this repo,

`npm run import`

 If you have installed it locally:

 Create a script in your package.json
 ```js
scripts: {
  'export-icons': 'export-icons'
}
```
and run
```sh
npm run export-icons
```

### Saving Pngs
To save as png and NOT delete the asset directory, use the `-p` flag: 

```
npm run export-icons -p
```


## Credits

This script was forked from [figma-export-icons](https://github.com/tsimenis/figma-export-icons) and modified.
