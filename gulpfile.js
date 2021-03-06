'use strict';

/* eslint no-console: 0 */
const path = require('path'),
      gulp = require('gulp'),
      concat = require('gulp-concat'),
      replace = require('gulp-replace'),
      sourcemaps = require('gulp-sourcemaps'),
      minimist = require('minimist'),
      stylus = require('gulp-stylus'),
      riot = require('gulp-riot'),
      pug = require('gulp-pug'),
      sprite = require('gulp-svgstore'),

      jsdocx = require('jsdoc-x'),

      streamQueue = require('streamqueue'),
      notifier = require('node-notifier'),
      fs = require('fs-extra'),

      spawnise = require('./node_requires/spawnise');

const argv = minimist(process.argv.slice(2));
const npm = (/^win/).test(process.platform) ? 'npm.cmd' : 'npm';

const pack = require('./app/package.json');

var channelPostfix = argv.channel || false;

let errorBoxShown = false;
const showErrorBox = function () {
    if (!errorBoxShown) {
        errorBoxShown = true;
        console.error(`
 ╭──────────────────────────────────────────╮
 │                                          ├──╮
 │             Build failed! D:             │  │
 │                                          │  │
 │  If you have recently pulled changes     │  │
 │  or have just cloned the repo, run this  │  │
 │  command in your console:                │  │
 │                                          │  │
 │  $ gulp -f devSetup.gulpfile.js          │  │
 │                                          │  │
 ╰─┬────────────────────────────────────────╯  │
   ╰───────────────────────────────────────────╯
`);
    }
};

const makeErrorObj = (title, err) => {
    showErrorBox();
    return {
        title,
        message: err.toString(),
        icon: path.join(__dirname, 'error.png'),
        sound: true,
        wait: true
    };
};

const fileChangeNotifier = p => {
    notifier.notify({
        title: `Updating ${path.basename(p)}`,
        message: `${p}`,
        icon: path.join(__dirname, 'cat.png'),
        sound: false,
        wait: false
    });
};

const compileStylus = () =>
    gulp.src('./src/styl/theme*.styl')
    .pipe(sourcemaps.init())
    .pipe(stylus({
        compress: true,
        'include css': true
    }))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./app/data/'));

const compilePug = () =>
    gulp.src('./src/pug/*.pug')
    .pipe(sourcemaps.init())
    .pipe(pug({
        pretty: false
    }))
    .on('error', err => {
        notifier.notify(makeErrorObj('Pug failure', err));
        console.error('[pug error]', err);
    })
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./app/'));

const compileRiot = () =>
    gulp.src('./src/riotTags/**')
    .pipe(riot({
        compact: false,
        template: 'pug'
    }))
    .pipe(concat('riot.js'))
    .pipe(gulp.dest('./temp/'));

const concatScripts = () =>
    streamQueue({objectMode: true},
        gulp.src('./src/js/3rdparty/riot.min.js'),
        gulp.src(['./src/js/**', '!./src/js/3rdparty/riot.min.js']),
        gulp.src('./temp/riot.js')
    )
    .pipe(sourcemaps.init())
    .pipe(concat('bundle.js'))
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./app/data/'))
    .on('error', err => {
        notifier.notify({
            title: 'Scripts error',
            message: err.toString(),
            icon: path.join(__dirname, 'error.png'),
            sound: true,
            wait: true
        });
        console.error('[scripts error]', err);
    })
    .on('change', fileChangeNotifier);
const copyRequires = () =>
    gulp.src('./src/node_requires/**/*')
    .pipe(gulp.dest('./app/data/node_requires'));

const compileScripts = gulp.series(compileRiot, concatScripts);

const icons = () =>
    gulp.src('./src/icons/**/*.svg')
    .pipe(sprite())
    .pipe(gulp.dest('./app/data'));

const watchScripts = () => {
    gulp.watch('./src/js/**/*', gulp.series(compileScripts))
    .on('error', err => {
        notifier.notify(makeErrorObj('General scripts error', err));
        console.error('[scripts error]', err);
    })
    .on('change', fileChangeNotifier);
};
const watchRiot = () => {
    gulp.watch('./src/riotTags/**/*', gulp.series(compileScripts))
    .on('error', err => {
        notifier.notify(makeErrorObj('Riot failure', err));
        console.error('[pug error]', err);
    })
    .on('change', fileChangeNotifier);
};
const watchStylus = () => {
    gulp.watch('./src/styl/**/*', compileStylus)
    .on('error', err => {
        notifier.notify(makeErrorObj('Stylus failure', err));
        console.error('[styl error]', err);
    })
    .on('change', fileChangeNotifier);
};
const watchPug = () => {
    gulp.watch('./src/pug/*.pug', compilePug)
    .on('change', fileChangeNotifier)
    .on('error', err => {
        notifier.notify(makeErrorObj('Pug failure', err));
        console.error('[pug error]', err);
    });
};
const watchRequires = () => {
    gulp.watch('./src/node_requires/**/*', copyRequires)
    .on('change', fileChangeNotifier)
    .on('error', err => {
        notifier.notify(makeErrorObj('Failure of node_requires', err));
        console.error('[node_requires error]', err);
    });
};
const watchIcons = () => {
    gulp.watch('./src/icons/**/*.svg', icons);
};

const watch = () => {
    watchScripts();
    watchStylus();
    watchPug();
    watchRiot();
    watchRequires();
    watchIcons();
};

const lintStylus = () => {
    const stylint = require('gulp-stylint');
    return gulp.src(['./src/styl/**/*.styl', '!./src/styl/3rdParty/**/*.styl'])
    .pipe(stylint())
    .pipe(stylint.reporter())
    .pipe(stylint.reporter('fail', {
        failOnWarning: true
    }));
};

const lintJS = () => {
    const eslint = require('gulp-eslint');
    return gulp.src(['./src/js/**/*.js', '!./src/js/3rdparty/**/*.js', './src/node_requires/**/*.js'])
    .pipe(eslint())
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
};

const lintI18n = () => require('./node_requires/i18n')().then(console.log);

const lint = gulp.series(lintJS, lintStylus, lintI18n);

const launchApp = () => {
    spawnise.spawn(npm, ['run', 'start'], {
        cwd: './app'
    }).then(launchApp);
};

const docs = async () => {
    try {
        await fs.remove('./app/data/docs/');
        await spawnise.spawn(npm, ['run', 'build'], {
            cwd: './docs'
        });
        await fs.copy('./docs/docs/.vuepress/dist', './app/data/docs/');
    } catch (e) {
        showErrorBox();
        throw e;
    }
};

// @see https://microsoft.github.io/monaco-editor/api/enums/monaco.languages.completionitemkind.html
const kindMap = {
    function: 'Function',
    class: 'Class'
};
const getAutocompletion = doc => {
    if (doc.kind === 'function') {
        if (!doc.params || doc.params.length === 0) {
            return doc.longname + '()';
        }
        return doc.longname + `(${doc.params.map(param => param.name).join(', ')})`;
    }
    if (doc.kind === 'class') {
        return doc.name;
    }
    return doc.longname;
};
const getDocumentation = doc => {
    if (!doc.description) {
        return void 0;
    }
    if (doc.kind === 'function') {
        return {
            value: `${doc.description}
${(doc.params || []).map(param => `* \`${param.name}\` (${param.type.names.join('|')}) ${param.description} ${param.optional? '(optional)' : ''}`).join('\n')}

Returns ${doc.returns[0].type.names.join('|')}, ${doc.returns[0].description}`
        };
    }
    return {
        value: doc.description
    };
};

const bakeCompletions = () =>
    jsdocx.parse({
        files: './app/data/ct.release/**/*.js',
        excludePattern: '(DragonBones|pixi)',
        undocumented: false,
        allowUnknownTags: true
    })
    .then(docs => {
        const registry = [];
        for (const doc of docs) {
            console.log(doc);
            if (doc.params) {
                for (const param of doc.params) {
                    console.log(param);
                }
            }
            const item = {
                label: doc.name,
                insertText: doc.autocomplete || getAutocompletion(doc),
                documentation: getDocumentation(doc),
                kind: kindMap[doc.kind] || 'Property'
            };
            registry.push(item);
        }
        fs.outputJSON('./app/data/node_requires/codeEditor/autocompletions.json', registry, {
            spaces: 2
        });
    });
const bakeCtTypedefs = cb => {
    spawnise.spawn(npm, ['run', 'ctTypedefs'])
    .then(cb);
};
const concatTypedefs = () =>
    gulp.src(['./src/typedefs/ct.js/types.d.ts', './src/typedefs/ct.js/**/*.ts', './src/typedefs/default/**/*.ts'])
    .pipe(concat('global.d.ts'))
    // patch the generated output so ct classes allow custom properties
    .pipe(replace(
        'declare class Copy extends PIXI.AnimatedSprite {', `
        declare class Copy extends PIXI.AnimatedSprite {
            [key: string]: any
        `))
    .pipe(replace(
        'declare class Room extends PIXI.Container {', `
        declare class Room extends PIXI.Container {
            [key: string]: any
        `))
    // also, remove JSDOC's @namespace flags so the popups in ct.js become more clear
    .pipe(replace(`
 * @namespace
 */
declare namespace`, `
 */
declare namespace`))
    .pipe(replace(`
     * @namespace
     */
    namespace`, `
     */
    namespace`))
    .pipe(gulp.dest('./app/data/typedefs/'));

// electron-builder ignores .d.ts files no matter how you describe your app's contents.
const copyPixiTypedefs = () => gulp.src('./app/node_modules/pixi.js/pixi.js.d.ts')
    .pipe(gulp.dest('./app/data/typedefs'));

const bakeTypedefs = gulp.series([bakeCtTypedefs, concatTypedefs, copyPixiTypedefs]);


const build = gulp.parallel([
    compilePug,
    compileStylus,
    compileScripts,
    copyRequires,
    icons,
    bakeTypedefs
]);

const bakePackages = async () => {
    const builder = require('electron-builder');
    await fs.remove(path.join('./build', `ctjs - v${pack.version}`));
    await builder.build({// @see https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/packagerApi.ts
        projectDir: './app',
        //mac: pack.build.mac.target || ['default'],
        //win: pack.build.win.target,
        //linux: pack.build.linux.target
    });
};


const examples = () => gulp.src('./src/examples/**/*')
    .pipe(gulp.dest('./app/examples'));

// eslint-disable-next-line valid-jsdoc
/**
 * @see https://stackoverflow.com/a/22907134
 */
const patronsCache = done => {
    const http = require('https');

    const dest = './app/data/patronsCache.csv',
          src = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTUMd6nvY0if8MuVDm5-zMfAxWCSWpUzOc81SehmBVZ6mytFkoB3y9i9WlUufhIMteMDc00O9EqifI3/pub?output=csv';
    const file = fs.createWriteStream(dest);
    http.get(src, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close(() => done()); // close() is async, call cb after close completes.
        });
    })
    .on('error', function(err) { // Handle errors
        fs.unlink(dest); // Delete the file async. (But we don't check the result)
        done(err);
    });
};

const packages = gulp.series([
    lint,
    build,
    docs,
    patronsCache,
    examples,
    bakePackages
]);

const deployOnly = () => {
    console.log(`For channel ${channelPostfix}`);
    return spawnise.spawn('./butler', ['push', `./build/ctjs - v${pack.version}/linux32`, `comigo/ct:linux32${channelPostfix? '-' + channelPostfix: ''}`, '--userversion', pack.version])
    .then(() => spawnise.spawn('./butler', ['push', `./build/ctjs - v${pack.version}/linux64`, `comigo/ct:linux64${channelPostfix? '-' + channelPostfix: ''}`, '--userversion', pack.version]))
    .then(() => spawnise.spawn('./butler', ['push', `./build/ctjs - v${pack.version}/osx64`, `comigo/ct:osx64${channelPostfix? '-' + channelPostfix: ''}`, '--userversion', pack.version]))
    .then(() => spawnise.spawn('./butler', ['push', `./build/ctjs - v${pack.version}/win32`, `comigo/ct:win32${channelPostfix? '-' + channelPostfix: ''}`, '--userversion', pack.version]))
    .then(() => spawnise.spawn('./butler', ['push', `./build/ctjs - v${pack.version}/win64`, `comigo/ct:win64${channelPostfix? '-' + channelPostfix: ''}`, '--userversion', pack.version]));
};

const deploy = gulp.series([packages, deployOnly]);

const launchDevMode = done => {
    watch();
    launchApp();
    done();
};
const defaultTask = gulp.series(build, launchDevMode);


exports.lint = lint;
exports.packages = packages;
exports.patronsCache = patronsCache;
exports.docs = docs;
exports.build = build;
exports.deploy = deploy;
exports.deployOnly = deployOnly;
exports.default = defaultTask;
exports.bakeCompletions = bakeCompletions;
exports.bakeTypedefs = bakeTypedefs;
