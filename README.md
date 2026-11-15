# pyroscale-preview

PyroScale is an interactive globe for exploring NASA FIRMS hotspot records, monthly forecasts, and what-if scenarios. [Open the hosted site](https://notharoon-jpg.github.io/pyroscale-project/).

## Run PyroScale locally

You need [Python 3](https://www.python.org/downloads/) and a modern browser with WebGL enabled. The website uses static files and includes its observation and forecast datasets. You can run it without installing Python packages, Node.js, or providing an API key. Git is only needed if you choose the clone option.

### 1. Download and extract the project

1. Open the [GitHub repository](https://github.com/notharoon-jpg/pyroscale-project), select the `main` branch, then choose **Code → Download ZIP**. You can also [download the ZIP directly](https://github.com/notharoon-jpg/pyroscale-project/archive/refs/heads/main.zip).
2. Extract the whole ZIP. On Windows, right-click it and select **Extract All**. On macOS, double-click it. On Linux, use your archive manager's **Extract** option.
3. Open the extracted `pyroscale-project-main` folder. If extraction created two folders with similar names, use the inner one that contains `index.html`, `explore.html`, `assets/`, and `pyroscale_data.json`. Keep the files and folders together.

If you already use Git, you can clone the repository from a terminal.

```sh
git clone https://github.com/notharoon-jpg/pyroscale-project.git
cd pyroscale-project
```

### 2. Start a local server

Open a terminal in the project folder. In Windows File Explorer, you can right-click an empty area in the folder and select **Open in Terminal**. On macOS or Linux, open Terminal and run `cd ~/Downloads/pyroscale-project-main` if you extracted the ZIP in Downloads. Adjust the path if you extracted it somewhere else. If you followed the Git commands above, your terminal is already in the project folder.

**Windows (PowerShell or Command Prompt)**

```powershell
py -3 -m http.server 8000 --bind 127.0.0.1
```

If `py` is unavailable and `python --version` shows Python 3, run `python -m http.server 8000 --bind 127.0.0.1`.

**macOS or Linux**

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Keep the terminal open while you use the site. Press **Ctrl+C** in that terminal to stop the server.

### 3. Open the website

1. Go to [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser.
2. Select **Explore** on the landing page, or open the [globe directly](http://127.0.0.1:8000/explore.html).
3. Select **Standard HD** and **Open globe**. Wait for the bundled observations to load, then select **Analysis** on the right edge to open the hotspot calendar or switch to **Forecast**.

### Troubleshooting

| What you see | What to check |
| --- | --- |
| The terminal can't find Python | Install Python 3, reopen the terminal, then check `py -3 --version` on Windows or `python3 --version` on macOS or Linux. |
| A folder listing or a 404 | Start the server from the folder that directly contains `index.html` and `explore.html`. |
| The browser can't connect | Keep the server running and check that the port in the browser matches the command. If port `8000` is in use, replace it with `8001` in the command and open [http://127.0.0.1:8001/](http://127.0.0.1:8001/). |
| The page opens but observations or imagery are missing | Use the `http://127.0.0.1:8000/` address. Opening `index.html` directly as a `file://` page can prevent the browser from fetching the data. Also check that you extracted the full ZIP, including `assets/`, `pyroscale_data.json`, and `pyroscale_forecast.json`. |
| The globe says WebGL is unavailable | Try a current browser with hardware acceleration enabled. You can still open **Analysis** to inspect the bundled data. |

The core explorer uses the bundled files. Optional services such as weather and air quality require an internet connection.
