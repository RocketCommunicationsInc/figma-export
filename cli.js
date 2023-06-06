#!/usr/bin/env node

const defaults = require("./src/defaults");
const figma = require("./src/figma-client");
const fs = require("fs");
const path = require("path");
const ora = require("ora");
const chalk = require("chalk");
const ui = require("cliui")({ width: 80 });
const axios = require("axios");
const prompts = require("prompts");
const promptsList = require("./src/prompts");
const mkdirp = require("mkdirp");
const argv = require("minimist")(process.argv.slice(2));
let config = {};
let figmaClient;
const spinner = ora();

function deleteConfig() {
    const configFile = path.resolve(defaults.configFileName);
    if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
        console.log(chalk.cyan.bold("Deleted previous config"));
    }
}

function updateGitIgnore() {
    const ignorePath = ".gitignore";
    const configPath = argv.config || defaults.configFileName;
    const ignoreCompletePath = path.resolve(ignorePath);
    if (fs.existsSync(configPath)) {
        const ignoreContent = `\n#figma-export-icons\n${configPath}`;
        const ignore = fs.existsSync(ignoreCompletePath)
            ? fs.readFileSync(ignoreCompletePath, "utf-8")
            : "";
        if (!ignore.includes(ignoreContent)) {
            fs.writeFileSync(ignoreCompletePath, ignore + ignoreContent);
            console.log(`Updated ${ignorePath} : ${ignoreContent}`);
        }
    }
}

function getConfig() {
    return new Promise((resolve) => {
        const configFile = path.resolve(argv.config || defaults.configFileName);
        if (fs.existsSync(configFile)) {
            config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
            const missingConfig = promptsList.filter((q) => !config[q.name]);
            if (missingConfig.length > 0)
                getPromptData(missingConfig).then(() => resolve());
            else resolve();
        } else {
            getPromptData().then(() => resolve());
        }
    });
}

async function getPromptData(list = promptsList) {
    const onCancel = (prompt) => {
        process.exit(1);
    };
    const response = await prompts(list, { onCancel });
    config = Object.assign(config, response);
    fs.writeFileSync("icons-config.json", JSON.stringify(config, null, 2));
}

function createOutputDirectory() {
    return new Promise((resolve) => {
        const directory = path.resolve(config.iconsPath);
        if (!fs.existsSync(directory)) {
            console.log(`Directory ${config.iconsPath} does not exist`);
            if (mkdirp.sync(directory)) {
                console.log(`Created directory ${config.iconsPath}`);
                resolve();
            }
        } else {
            resolve();
        }
    });
}

function deleteIcon(iconPath) {
    return new Promise((resolve) => {
        fs.unlink(iconPath, (err) => {
            if (err) throw err;
            // if no error, file has been deleted successfully
            resolve();
        });
    });
}

function deleteDirectory(directory) {
    return new Promise((resolve) => {
        fs.rmdir(directory, (err) => {
            if (err) throw err;
            resolve();
        });
    });
}

function deleteIcons() {
    return new Promise((resolve) => {
        const directory = path.resolve(config.iconsPath);
        // read icons directory files
        fs.readdir(directory, (err, files) => {
            if (err) throw err;
            spinner.start("Deleting directory contents");
            let filesToDelete = [];
            let subdirectories = [];
            files.forEach((file) => {
                const hasSubdirectory = fs
                    .lstatSync(path.join(directory, file))
                    .isDirectory();
                if (hasSubdirectory) {
                    const subdirectory = path.join(directory, file);
                    subdirectories.push(subdirectory);
                    // read subdirectory
                    fs.readdir(subdirectory, (err, files) => {
                        if (err) throw err;
                        files.forEach((file) =>
                            filesToDelete.push(
                                deleteIcon(path.join(subdirectory, file))
                            )
                        );
                    });
                } else {
                    if (file !== "README.md") {
                        filesToDelete.push(
                            deleteIcon(path.join(directory, file))
                        );
                    }
                }
            });
            Promise.all(filesToDelete).then(() => {
                const directoriesToDelete = subdirectories.map((subdirectory) =>
                    deleteDirectory(subdirectory)
                );
                Promise.all(directoriesToDelete).then(() => {
                    spinner.succeed();
                    resolve();
                });
            });
        });
    });
}

function findDuplicates(propertyName, arr) {
    return arr.reduce((acc, current) => {
        const x = acc.find(
            (item) => item[propertyName] === current[propertyName]
        );
        if (x) {
            spinner.fail(
                chalk.bgRed.bold(
                    `Duplicate icon name: ${x[propertyName]}. Please fix figma file`
                )
            );
            current[propertyName] = current[propertyName] + "-duplicate-name";
        }
        return acc.concat([current]);
    }, []);
}

function getPathToFrame(root, current) {
    if (!current.length) return root;
    const path = [...current];
    const name = path.shift();
    const foundChild = root.children.find((c) => c.name === name);
    if (!foundChild) return root;
    return getPathToFrame(foundChild, path);
}

function fetchFrames(pageName, res) {
    const endTime = new Date().getTime();
    spinner.succeed();
    console.log(
        chalk.cyan.bold(
            `Finished in ${(endTime - res.config.startTime) / 1000}s\n`
        )
    );
    const page = res.data.document.children.find((c) => c.name === pageName);
    if (!page) {
        console.log(
            chalk.red.bold("Cannot find Icons Page, check your settings")
        );
        return;
    }
    const shouldGetFrame = isNaN(config.frame) && parseInt(config.frame) !== -1;
    let iconsArray = page.children;
    if (shouldGetFrame) {
        const frameNameArr = config.frame.split("/").filter(Boolean);
        const frameName = frameNameArr.pop();
        const frameRoot = getPathToFrame(page, frameNameArr);
        if (!frameRoot.children.find((c) => c.name === frameName)) {
            console.log(
                chalk.red.bold(
                    "Cannot find",
                    chalk.white.bgRed(frameName),
                    "Frame in this Page, check your settings"
                )
            );
            return;
        }
        iconsArray = frameRoot.children.find(
            (c) => c.name === frameName
        ).children;
    }
    let icons = iconsArray.map((icon) => {
        return { id: icon.id, name: icon.name };
    });
    icons = findDuplicates("name", icons);
    return icons;
}
function getFigmaFile() {
    return new Promise((resolve) => {
        spinner.start(
            "Fetching Figma file (this might take a while depending on the figma file size)"
        );
        figmaClient
            .get(`/files/${config.fileId}`)
            .then((res) => {
                let output = [];
                console.log("hhhhhhh");
                console.log("pages", config.pages);
                if (config.pages && config.pages.length > 0) {
                    config.pages.map((configPage) => {
                        const icons = fetchFrames(configPage, res);
                        output = [...output, icons];
                    });
                    resolve(output.flat());
                } else {
                    const pageData = fetchFrames(config.page, res);
                    resolve(pageData);
                }
            })
            .catch((err) => {
                spinner.fail();
                if (err.response) {
                    console.log(
                        chalk.red.bold(
                            `Cannot get Figma file: ${err.response.data.status} ${err.response.data.err}`
                        )
                    );
                } else {
                    console.log(err);
                }
                process.exit(1);
            });
    });
}

function getImages(icons, format = "svg") {
    return new Promise((resolve) => {
        spinner.start("Fetching icon urls");
        console.log("icons", icons);
        const iconIds = icons.map((icon) => icon.id).join(",");
        figmaClient
            .get(
                `/images/${config.fileId}?ids=${iconIds}&scale=2format=${format}`
            )
            .then((res) => {
                spinner.succeed();
                const images = res.data.images;
                icons.forEach((icon) => {
                    icon.image = images[icon.id];
                });
                resolve(icons);
            })
            .catch((err) => {
                console.log("Cannot get icons: ", err);
                process.exit(1);
            });
    });
}

function downloadImage(url, name, format = "svg") {
    // name = name.replace(/\//g, '-').replace(/ /g,'-').toLowerCase()
    let nameClean = name;
    let directory = config.iconsPath;
    const idx = name.lastIndexOf("/");
    if (idx !== -1) {
        // directory = directory + '/' + name.substring(0, idx)
        directory = directory;
        nameClean = name
            .substring(idx + 1)
            .replace(/\//g, "-")
            .replace(/ /g, "-")
            .toLowerCase();
        if (!fs.existsSync(directory)) {
            if (mkdirp.sync(directory)) {
                console.log(`\nCreated sub directory ${directory}`);
                iconPath = directory;
            } else {
                console.log("Cannot create directories");
                process.exit(1);
            }
        }
    }
    const imagePath = path.resolve(directory, `${nameClean}.${format}`);
    const writer = fs.createWriteStream(imagePath);

    axios
        .get(url, { responseType: "stream" })
        .then((res) => {
            res.data.pipe(writer);
        })
        .catch((err) => {
            spinner.fail();
            console.log(name);
            console.log(err.message);
            console.log(err.config.url);
            console.log(
                chalk.red.bold(
                    "Something went wrong fetching the image from S3, please try again"
                )
            );
            process.exit(1);
        });

    return new Promise((resolve, reject) => {
        writer.on("finish", () => {
            // console.log(`Saved ${name}.svg`, fs.statSync(imagePath).size)
            resolve({
                name: `${name}.${format}`,
                size: fs.statSync(imagePath).size
            });
        });
        writer.on("error", (err) => {
            console.log("error writting file", err);
            reject(err);
        });
    });
}

function makeRow(a, b) {
    return `  ${a}\t    ${b}\t`;
}

function formatSize(size) {
    return (size / 1024).toFixed(2) + " KiB";
}

function makeResultsTable(results) {
    ui.div(
        makeRow(chalk.cyan.bold(`File`), chalk.cyan.bold(`Size`)) +
            `\n\n` +
            results
                .map((asset) =>
                    makeRow(
                        asset.name.includes("-duplicate-name")
                            ? chalk.red.bold(asset.name)
                            : chalk.green(asset.name),
                        formatSize(asset.size)
                    )
                )
                .join(`\n`)
    );
    return ui.toString();
}
function removeFromName(name) {
    return name.replace(config.removeFromName, "");
}
function exportIcons() {
    getFigmaFile().then((res) => {
        getImages(res)
            .then((icons) => {
                console.log(`Api returned ${icons.length} icons\n`);
                createOutputDirectory().then(() => {
                    deleteIcons().then(() => {
                        spinner.start("Downloading");
                        const AllIcons = icons
                            .filter((icon) => {
                                /**
                                 * Figma File contains Text for grouping that should not be exported
                                 * We're filtering assets named /Group/Style/Name to make sure we are
                                 * only downloading Icons
                                 */
                                return icon.name.split("/").length > 1;
                            })
                            .map((icon) =>
                                downloadImage(
                                    icon.image,
                                    removeFromName(icon.name)
                                )
                            );
                        // const AllIcons = []
                        Promise.all(AllIcons).then((res) => {
                            spinner.succeed(
                                chalk.cyan.bold("Download Finished!\n")
                            );
                            console.log(`${makeResultsTable(res)}\n`);
                            writeResults(res);
                        });
                    });
                });
            })
            .catch((err) => {
                console.log(chalk.red(err));
            });
    });
}

function exportImages() {
    getFigmaFile().then((res) => {
        getImages(res, "png")
            .then((icons) => {
                createOutputDirectory().then(() => {
                    spinner.start("Downloading");
                    // Filter out anything with a name that starts with _. The file includes some metadata text styles for grouping.
                    const AllIcons = icons
                        .filter((icon) => !icon.name.includes("_"))
                        .map((icon) =>
                            downloadImage(
                                icon.image,
                                removeFromName(icon.name),
                                "png"
                            )
                        );
                    Promise.all(AllIcons).then((res) => {
                        spinner.succeed(
                            chalk.cyan.bold("Download Finished!\n")
                        );
                        console.log(`${makeResultsTable(res)}\n`);
                    });
                });
            })
            .catch((err) => {
                console.log("fail to get images", res);
                console.log(chalk.red(err));
            });
    });
}
function writeResults(data) {
    const results = {};
    data.filter((item) => item.name.split("/").length === 3).forEach((item) => {
        const paths = item.name.split("/");
        const group = paths[0];
        const style = paths[1];
        const icon = paths[2]
            .replace(/.svg/g, "")
            .replace(/\//g, "-")
            .replace(/ /g, "-")
            .toLowerCase();
        if (!results[group]) {
            results[group] = {};
        }
        if (!results[group][style]) {
            results[group][style] = [];
        }

        results[group][style].push(icon);
    });

    const orderedResults = Object.keys(results)
        .sort()
        .reduce((obj, key) => {
            obj[key] = results[key];
            return obj;
        }, {});

    fs.writeFile(
        `${config.metaPath}/icons.json`,
        JSON.stringify(orderedResults),
        (err) => {
            if (err) {
                console.error(err);
                return;
            }
        }
    );
}
function run() {
    updateGitIgnore();
    if (argv.c) {
        deleteConfig();
    }
    getConfig().then(() => {
        figmaClient = figma(config.figmaPersonalToken);
        if (argv.p) {
            exportImages();
        } else {
            exportIcons();
        }
    });
}

run();
