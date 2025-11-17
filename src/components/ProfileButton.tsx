import { JSX, createSignal, onMount, Show, onCleanup } from "solid-js";
import { CgProfile } from "solid-icons/cg";
import { getNachoUserInfo, type NachoUserInfo } from "../lib/nachoAuth";

type ProfileButtonProps = {
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  title?: string;
};

const ProfileButton = (props: ProfileButtonProps) => {
  const [isLoggedIn, setIsLoggedIn] = createSignal(false);
  const [userInfo, setUserInfo] = createSignal<NachoUserInfo | null>(null);

  const checkAuthentication = async () => {
    const user = await getNachoUserInfo();
    if (user) {
      setIsLoggedIn(true);
      setUserInfo(user);
    } else {
      setIsLoggedIn(false);
      setUserInfo(null);
    }
  };

  onMount(async () => {
    await checkAuthentication();

    // Listen for authentication events
    const handleAuthSuccess = (event: Event) => {
      const customEvent = event as CustomEvent<{ user: NachoUserInfo }>;
      if (customEvent.detail?.user) {
        setIsLoggedIn(true);
        setUserInfo(customEvent.detail.user);
      }
    };

    window.addEventListener("nacho-auth-success", handleAuthSuccess);

    onCleanup(() => {
      window.removeEventListener("nacho-auth-success", handleAuthSuccess);
    });
  });

  return (
    <Show when={isLoggedIn()}>
      <div class="flex items-center gap-3">
        <div class="text-right hidden sm:block">
          <div class="text-sm font-medium text-white">
            {userInfo()?.username || "User"}
          </div>
          <Show when={userInfo()?.isAdmin}>
            <div class="text-xs text-orange-400">Admin</div>
          </Show>
        </div>
        <button
          onClick={props.onClick}
          title={props.title || userInfo()?.username || "Profile"}
          class="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white hover:shadow-lg hover:scale-105 transition-all duration-200 border-2 border-orange-400/30"
        >
          <CgProfile class="w-5 h-5" />
        </button>
      </div>
    </Show>
  );
};

export default ProfileButton;
