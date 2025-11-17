import { Component, createSignal, onMount } from "solid-js";
import Media from "./Movies";
import Series from "./Series";
import Downloads from "./Downloads";
import AddTorrent from "./AddTorrent";
import MediaLibrary from "./MediaLibrary";
import UserLogin from "./UserLogin";
import Settings from "./Settings";
import Search from "./Search";
import Header from "../components/Header";
import ProfileButton from "../components/ProfileButton";
import { invoke } from "@tauri-apps/api/core";

const Home: Component = () => {
  const [activeTab, setActiveTab] = createSignal<
    | "media"
    | "series"
    | "downloads"
    | "add"
    | "library"
    | "trakt"
    | "settings"
    | "search"
  >("media");

  onMount(async () => {
    // Show the window when the component is mounted
    setTimeout(async () => {
      await invoke("show_main");
    }, 20);
  });

  return (
    <div class="min-h-screen ">
      <Header
        Title={() => (
          <h1 class="text-xl xl:text-5xl text-neutral-100 monoton select-none">
            Nacho
          </h1>
        )}
        ProfileButton={() => (
          <ProfileButton
            onClick={() => alert("Profile clicked!")}
            title="Profile"
          />
        )}
        subheaders={[
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("media")}
          >
            Movies
          </button>,
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("series")}
          >
            Series
          </button>,
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("search")}
          >
            Search
          </button>,
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("downloads")}
          >
            Downloads
          </button> /* 
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("library")}
          >
            Library
          </button>, */,
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("add")}
          >
            Add Custom Torrent
          </button>,

          /* <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("trakt")}
          >
            Trakt Login
          </button>, */
          <button
            class="font-semibold transition-colors cursor-pointer p-4"
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>,
        ]}
        class="mb-4 select-none"
      />

      <main class="w-full select-none">
        {/* Tab Content */}
        <div class="px-6">
          {activeTab() === "media" && (
            <Media isVisible={activeTab() === "media"} />
          )}
          {activeTab() === "series" && (
            <Series isVisible={activeTab() === "series"} />
          )}
          {activeTab() === "downloads" && <Downloads />}
          {activeTab() === "library" && <MediaLibrary />}
          {activeTab() === "add" && (
            <AddTorrent onSuccess={() => setActiveTab("downloads")} />
          )}
          {activeTab() === "search" && <Search />}
          {activeTab() === "trakt" && <UserLogin />}
          {activeTab() === "settings" && <Settings />}
        </div>
      </main>
    </div>
  );
};

export default Home;
