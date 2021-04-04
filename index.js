const { app, BrowserWindow, Tray, Notification, globalShortcut, dialog, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const temp = require('temp');
const screenshot = require("screenshot-desktop");
var { spawn } = require("child_process");
const util = require("electron-util");
const ffmpeg = require("@ffmpeg-installer/ffmpeg");
const ffmpegPath = util.fixPathForAsarUnpack(ffmpeg.path);
const AutoLaunch = require("auto-launch");
const Store = require("electron-store");
temp.track(); // remove the temp folder to save memory :P

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
  return;
}

const {
  hasScreenCapturePermission,
  hasPromptedForPermission,
  openSystemPreferences
} = require('mac-screen-capture-permissions');


let store = new Store();
const autoLauncher = new AutoLaunch({
  name: "Lapse",
  path: '/Applications/lapse.app',
});

// App icons to show record and stop
const appIcon = path.join(__dirname, 'appTemplate.png');
const recordIcon = path.join(__dirname, 'recordTemplate.png');

let tray,
  isPaused = false,
  isRecording = false,
  interval,
  //   timer,
  framecount = 0,
  imagesDir,
  browserWindow,
  user = {
    isVerified: false,
    id: null,
    name: null
  },
  settings = {
    autolaunch: true,
    quality: 25,//6 12 18 24 30 36 42 48
    format: 'mp4',
    framerate: 30, //12 24,30,60,
    key: null,
  }

let hours = 0,
  minutes = 0,
  seconds = 0;
// store.set('settings',settings);
// store.set('user-info',user);

if (store.get('user-info')) {
  user = store.get('user-info');
}
if (store.get('lapse')) {
  settings = store.get('lapse');
  // store.set('lapse',  settings);
}
else {
  store.set('lapse', settings);
}

function UpdateSettings(newSettings) {
  if (newSettings.autolaunch) {
    autoLauncher.enable();
  }
  else {
    autoLauncher.disable();
  }
  settings = newSettings;
  store.set('lapse', newSettings);
}

function initiVariables() {
  hours = 0;
  minutes = 0;
  seconds = 0;
  isRecording = false;
  isPaused = false;
  tray.setImage(appIcon);
  tray.setToolTip('Lapse | Start recording');
  tray.setTitle('');
  clearInterval(interval);
  //   clearInterval(timer);
  imagesDir = null;
}

function showNotification(message) {
  const notification = {
    // title: message,
    body: message
  }
  new Notification(notification, { icon: appIcon }).show()
}

const createTray = async () => {
  tray = new Tray(appIcon);
  tray.setToolTip('Lapse | Start recording');
  let hasCapturePermission = hasScreenCapturePermission();
  console.log(hasCapturePermission);
  if (!hasCapturePermission) {
    tray.setToolTip('Enable recording permission in system preferances ');
    openSystemPreferences("security", "Privacy_ScreenCapture");
    app.quit();
    return;
  }
  // tray.on('click', clickTray);
  tray.on('click', startRecording)

}

const startRecording = () => {

  if (isPaused) {
    const contextMenu = [{
      label: 'Stop recording',
      click: async () => {
        await stopRecording();
        return;
      }
    },
    {
      role: 'quit',
      accelerator: process.platform === 'darwin' ? 'Alt+Shift+L' : 'Alt+Shift+L',
    }]
    const TrayMenu = Menu.buildFromTemplate(contextMenu);
    tray.popUpContextMenu(TrayMenu);
    return;
  }
  if (!isRecording) {
    const ContextMenu = [{
      label: "start recording",
      accelerator: process.platform === 'darwin' ? 'Alt+Cmd+L' : 'Alt+Ctrl+L',
      click: () => { clickTray() }
    },
    {
      label: "Export format",
      submenu: [{
        label: 'mp4',
        type: "checkbox",
        click: () => { settings.format = 'mp4'; UpdateSettings(settings) },
        checked: settings.format === 'mp4' ? true : false,
      }, {
        label: 'mkv',
        type: "checkbox",
        click: () => { settings.format = 'mkv'; UpdateSettings(settings) },
        checked: settings.format === 'mkv' ? true : false,
      }, {
        label: 'webm',
        type: "checkbox",
        click: () => { settings.format = 'webm'; UpdateSettings(settings) },
        checked: settings.format === 'webm' ? true : false,
      }, {
        label: 'avi',
        type: "checkbox",
        click: () => { settings.format = 'avi'; UpdateSettings(settings) },
        checked: settings.format === 'avi' ? true : false,
      }]
    },
    {
      label: 'Quality',
      submenu: [{
        label: 'Auto',
        type: 'checkbox',
        click: () => { settings.quality = 25; UpdateSettings(settings) },
        checked: settings.quality === 25 ? true : false,
      }, {
        label: '8k',
        type: 'checkbox',
        click: () => { settings.quality = 6; UpdateSettings(settings) },
        checked: settings.quality === 6 ? true : false,
      }, {
        label: '4k',
        type: 'checkbox',
        click: () => { settings.quality = 12; UpdateSettings(settings) },
        checked: settings.quality === 12 ? true : false,
      }, {
        label: '1080p',
        type: 'checkbox',
        click: () => { settings.quality = 18; UpdateSettings(settings) },
        checked: settings.quality === 18 ? true : false,
      }, {
        label: '720p',
        type: 'checkbox',
        click: () => { settings.quality = 24; UpdateSettings(settings) },
        checked: settings.quality === 24 ? true : false,
      }, {
        label: '480p',
        type: 'checkbox',
        click: () => { settings.quality = 32; UpdateSettings(settings) },
        checked: settings.quality === 32 ? true : false,
      }, {
        label: '360',
        type: 'checkbox',
        click: () => { settings.quality = 38; UpdateSettings(settings) },
        checked: settings.quality === 38 ? true : false,
      }, {
        label: '240p',
        type: 'checkbox',
        click: () => { settings.quality = 42; UpdateSettings(settings) },
        checked: settings.quality === 42 ? true : false,
      }, {
        label: '144p',
        type: 'checkbox',
        click: () => { settings.quality = 48; UpdateSettings(settings) },
        checked: settings.quality === 48 ? true : false,
      }]
    },
    {
      label: "Speed (framerate)",
      submenu: [{
        label: '12',
        type: "checkbox",
        click: () => { settings.framerate = 12; UpdateSettings(settings) },
        checked: settings.framerate === 12 ? true : false,
      }, {
        label: '24',
        type: "checkbox",
        click: () => { settings.framerate = 24; UpdateSettings(settings) },
        checked: settings.framerate === 24 ? true : false,
      }, {
        label: '30',
        type: "checkbox",
        click: () => { settings.framerate = 30; UpdateSettings(settings) },
        checked: settings.framerate === 30 ? true : false,
      }, {
        label: '60',
        type: "checkbox",
        click: () => { settings.framerate = 60; UpdateSettings(settings) },
        checked: settings.framerate === 60 ? true : false,
      }]
    },
    { type: 'separator' },
    {
      label: 'Reset Settings',
      click: () => {
        let cfg = {
          autolaunch: true,
          quality: 25,//6 12 18 24 30 36 42 48
          format: 'mp4',
          framerate: 30 //12 24,30,60
        }
        UpdateSettings(cfg)
      }
    },
    {
      label: "Auto launch",
      type: 'checkbox',
      click: () => { settings.autolaunch = !settings.autolaunch; UpdateSettings(settings) },
      checked: settings.autolaunch,
    },
    { type: 'separator' },
    {
      label: "About Lapse",
      click: () => { shell.openExternal('https://lapse.achuth.dev') }
    },
    {
      role: 'quit',
      accelerator: process.platform === 'darwin' ? 'Alt+Shift+L' : 'Alt+Shift+L',
    }
    ];
    const TrayMenu = Menu.buildFromTemplate(ContextMenu);
    tray.popUpContextMenu(TrayMenu);
  } else if(isRecording) {
    clickTray();
  }
}

const createGlobalShortcuts = () => {
  globalShortcut.register('CommandOrControl+Alt+l', clickTray);
  globalShortcut.register('Shift+Alt+q', () => { app.quit() });
}

const clickTray = async () => {
  if (!isRecording) {
    // tray.setTitle(` 00:00:00 `);
    tray.setToolTip('Recording....');
    tray.setImage(recordIcon);
    isRecording = true;
    framecount = 0;
    temp.mkdir('lapse_images', (err, dirPath) => {
      if (err) {
        return console.log(err);
      }
      imagesDir = dirPath;
      ffmpegImgPattern = path.join(imagesDir, "lapse%d.jpeg");
    });
    createScreenshotInterval();
  } else {
    if (isPaused) {
      isPaused = false;
      createScreenshotInterval();
      return;
    }
    else {
      clearInterval(interval)
      isPaused = true;
      let stringHours = hours.toString().length > 1 ? hours : `0${hours}`;
    let stringMinutes = minutes.toString().length > 1 ? minutes : `0${minutes}`;
    let stringseconds = seconds.toString().length > 1 ? seconds : `0${seconds}`;

      tray.setTitle(`${stringHours} : ${stringMinutes}: ${stringseconds}`);
      tray.setToolTip('Paused!!');

      const contextMenu = [{
        label: "Resume recording",
        accelerator: process.platform === 'darwin' ? 'Alt+Cmd+L' : 'Alt+Ctrl+L',
        click: () => { 
          clickTray();
          tray.setTitle('')
         }
      },{
        label: 'Stop recording',
        click: async () => {
          isRecording = false;
          initiVariables();
          await stopRecording();
          return;
        }
      },
      {
        role: 'quit',
        accelerator: process.platform === 'darwin' ? 'Alt+Shift+L' : 'Alt+Shift+L',
      }]
      const TrayMenu = Menu.buildFromTemplate(contextMenu);
      tray.popUpContextMenu(TrayMenu);
      // initiVariables();
      // await stopRecording();

      return;
    }
  }
  return;

}

const createScreenshotInterval = () => {

  interval = setInterval(() => {
    framecount += 1;
    seconds++;
    if (seconds === 60) {
      minutes++;
      seconds = 0;
    }
    if (minutes === 60) {
      hours++;
      minutes = 0;
    }
    // 00:00:00
    let stringHours = hours.toString().length > 1 ? hours : `0${hours}`;
    let stringMinutes = minutes.toString().length > 1 ? minutes : `0${minutes}`;
    let stringseconds = seconds.toString().length > 1 ? seconds : `0${seconds}`;

    // tray.setTitle(` ${stringHours} : ${stringMinutes}: ${stringseconds} `);
    takeScreenShot(framecount);

  }, 1000);
}

function takeScreenShot(framecount) {
  var filepath = path.join(imagesDir, `lapse${framecount++}.jpeg`);
  console.log(filepath);
  screenshot({ filename: filepath });
}

const stopRecording = async () => {
  isRecording = false;
  initiVariables();
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `lapse-${Date.now()}`,//.${selectedFormat}`,
    // filters: [
    //   { name: 'lapse', extensions: ['mkv', 'avi', 'mp4', '.webm'] }
    // ]
  });
  if (filePath) {
    let outputPath = filePath.split("\\");
    let filename = outputPath[outputPath.length - 1].split('.')[0];
    outputPath[outputPath.length - 1] = `${filename}.${settings.format}`; //'mp4'
    outputPath = outputPath.join('\\')
    let params = [
      "-y",
      "-r",
      `${settings.framerate}`,
      "-f",
      "image2",
      "-start_number",
      "0",
      "-i",
      ffmpegImgPattern,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-profile:v",
      "high",
      "-vcodec",
      "libx264",
      "-crf",
      `${settings.quality}`,
      "-coder",
      "1",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-g",
      "30",
      "-bf",
      "2",
      "-c:a",
      "aac",
      "-b:a",
      "384k",
      "-profile:a",
      "aac_low",
      outputPath,
    ]

    let startTime = Date.now();
    console.log("Start Time Create Timelape " + startTime);
    let converter = spawn(ffmpegPath, params);

    converter.stderr.setEncoding("utf8");
    converter.stdout.setEncoding("utf8");

    converter.stdout.on("data", function () {
      //data here  
    });

    converter.on("error", (err) => {
      temp.cleanupSync();
      console.log("Error On Command", err);
      ;
    });

    converter.on("exit", (code) => {
      console.log("exit code " + code);
      let endTime = Date.now();
      if (code === 0) {
        console.log(
          `This video take ${(endTime - startTime) / 60000} minutes `
        );
        console.log("timelapse cleanup");
        showNotification(`Video saved in path ${outputPath}`);
      }
      temp.cleanupSync();
    })
  } else {
    temp.cleanupSync();
    showNotification(`Error occured during process`);
    return;
  }
}

function createBrowserWindow() {
  browserWindow = new BrowserWindow({
    icon: path.join('app.png'),
    frame: false,
    height: 300,
    width: 300,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true
    }
  })
  browserWindow.loadFile('index.html')
}

app.on('ready', () => {
  if (user.isVerified) {
    if (settings.autolaunch) {
      autoLauncher.enable();
    }
    else {
      autoLauncher.disable();
    }
    console.log('o-log');
    createTray();
    createGlobalShortcuts();
    return;
  }
  createBrowserWindow();
  return;
});

if (app.dock) { app.dock.hide() }

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
  }
});

app.on("before-quit", async () => {
  if (isRecording) {
    await stopRecording();
  }
})
ipcMain.on('verified', (event, { id, name }) => {
  event.returnValue = "Verified";
  user.id = id;
  user.name = name;
  user.isVerified = true;
  store.set('user-info', user);
  browserWindow.hide();
  console.log("v-lo");
  createTray();
})

ipcMain.on('quit', () => {
  app.quit()
})