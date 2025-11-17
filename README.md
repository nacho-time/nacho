<h1 align=center>NACHO - Torrent Streaming Client with Content History Tracking</h1>

![Nacho Time teaser](docs/teaser1.jpg)

![Nacho Time teaser 2](docs/teaser2.jpg)

<h3 align=center>Tortilla chips have always been a far superior movie snack to popcorn. Sorry, not sorry.</h3>

<hr />
<h3 align=center>⚠️ Disclaimer ⚠️</h3>

<h3 align=center>This project only provides a tool to download torrents. Downloading and distributing copyrighted material is at your own responsibility, and can often be illegal depending on where you live. Downloads and information shown in the app are relayed from public sources, and are not provided nor owned by anyone contributing to this project.</h3>

<hr />

After the coup d'état that caused [Popcorn Time](https://github.com/popcorntime/popcorntime)'s codebase to mysteriously disappear, Nacho Time rises from the ashes as a Tauri-based torrent streaming client with built-in content history tracking. Built with a solid.js frontend and a Rust backend, Nacho Time is designed to provide a seamless and enjoyable movie and TV show streaming experience, with stronger privacy and no reliance on shady third-party services.

No more dependency on Russian servers! No more shady practices! Just pure, torrent streaming goodness.

A first version was built using the Trakt.tv API. However, trakt was only used to track watch history and get trending content. To avoid reliance on third-party services, Nacho Time now includes its own server component, [Nacho Server](https://github.com/nacho-time/nacho-time-server). Trakt support could be considered if syncing becomes interesting.

## [Nacho Server](https://github.com/nacho-time/nacho-time-server) is a required component to use Nacho. You can run it locally or use a hosted instance. If you are not a technical user, ask one of your tech-savvy friends to set one up! They can be shared by multiple users.

### No pre-built binaries are provided. You need to build Nacho Time from source for now. Luckily, building Tauri apps is pretty straightforward!

1. Clone this repository:

```bash
git clone https://github.com/nacho-time/nacho-time.git
cd nacho-time
```

2. Make sure you have Rust and Node.js installed. Then, install the dependencies:

```bash
pnpm install
```

3. Build and run the app:

```bash
pnpm tauri build
```

4. Once the app is built, you can find the binaries in the `src-tauri/target/release/bundle` folder.

5. Open Nacho Time, go to Settings, and enter your Nacho Server URL. Note that on MacOS, you need to place the app in the Applications folder for server linking to work properly (or you can manually configure the authentication token and server URL in settings).
