import {
  JSX,
  ParentComponent,
  createSignal,
  onMount,
  For,
  Show,
} from "solid-js";

type HeaderProps = {
  Title: ParentComponent;
  ProfileButton: ParentComponent;
  subheaders: JSX.Element[];
  class?: string;
};

const Header: ParentComponent<HeaderProps> = (props) => {
  const [activeIndex, setActiveIndex] = createSignal(0);
  const [blobStyle, setBlobStyle] = createSignal({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = createSignal(false);
  let navRef: HTMLElement | undefined;
  let itemRefs: (HTMLDivElement | undefined)[] = [];

  let hoverTimeout: ReturnType<typeof setTimeout> | undefined;

  const updateBlobPosition = (index: number, immediate = false) => {
    const item = itemRefs[index];
    const nav = navRef;

    if (item && nav) {
      const performUpdate = () => {
        // Use requestAnimationFrame to debounce rapid updates
        cancelAnimationFrame(updateBlobPosition.frameId);
        updateBlobPosition.frameId = requestAnimationFrame(() => {
          const navRect = nav.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();

          const left = itemRect.left - navRect.left;
          const width = itemRect.width;

          setBlobStyle({
            transform: `translateX(calc(${left}px))`,
            width: `calc(${width}px)`,
          });
        });
      };

      if (immediate) {
        performUpdate();
      } else {
        // Clear any existing timeout
        if (hoverTimeout !== undefined) {
          clearTimeout(hoverTimeout);
        }
        // Wait 50ms before updating
        hoverTimeout = setTimeout(performUpdate, 50);
      }
    }
  };
  updateBlobPosition.frameId = 0;

  const handleItemClick = (index: number) => {
    setActiveIndex(index);
    updateBlobPosition(index);
    setIsMobileMenuOpen(false); // Close mobile menu on selection
  };

  onMount(() => {
    // Set initial blob position
    if (props.subheaders.length > 0) {
      setTimeout(() => updateBlobPosition(0), 100);
    }
  });

  return (
    <div
      class={`w-full flex flex-col sticky top-0 bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-800/50 z-100 shadow-lg ${props.class}`}
    >
      <div class="flex items-center justify-between px-6 py-4">
        <div class="flex items-center gap-6 flex-1">
          <props.Title />

          {/* Navigation - Only visible from lg upwards */}
          {props.subheaders.length > 0 && (
            <nav
              ref={navRef}
              class="hidden lg:flex relative items-center bg-neutral-800/40 rounded-xl backdrop-blur-sm border border-neutral-700/50"
            >
              {/* Animated blob background */}
              <div
                class="absolute top-1/2 -translate-y-1/2 h-[calc(100%)] rounded-lg bg-gradient-to-r from-orange-500/30 to-red-500/30 backdrop-blur-sm border border-orange-500/40 transition-all duration-800 ease-in-out"
                style={blobStyle()}
              />

              {/* All items */}
              <For each={props.subheaders}>
                {(subheader, i) => (
                  <div
                    ref={(el) => (itemRefs[i()] = el)}
                    onClick={() => handleItemClick(i())}
                    onMouseEnter={() => updateBlobPosition(i())}
                    onMouseLeave={() => updateBlobPosition(activeIndex())}
                    class="relative z-10 text-sm font-medium cursor-pointer select-none transition-colors duration-200 flex items-center justify-center"
                    classList={{
                      "text-orange-100": activeIndex() === i(),
                      "text-neutral-400 hover:text-neutral-200":
                        activeIndex() !== i(),
                    }}
                  >
                    {subheader}
                  </div>
                )}
              </For>
            </nav>
          )}

          {/* Hamburger Button - Visible below lg */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen())}
            class="lg:hidden p-2 text-neutral-400 hover:text-neutral-200 transition-colors"
            aria-label="Toggle menu"
          >
            <Show
              when={!isMobileMenuOpen()}
              fallback={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              }
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </Show>
          </button>
        </div>

        <div class="ml-auto opacity-60 transition-opacity duration-300 hover:opacity-100">
          <props.ProfileButton />
        </div>
      </div>

      {/* Menu Dropdown - Below lg */}
      <Show when={isMobileMenuOpen()}>
        <div class="lg:hidden border-t border-neutral-800/50 bg-neutral-900/98 backdrop-blur-xl overflow-hidden animate-slideDown">
          <nav class="flex flex-col p-4 gap-2">
            <For each={props.subheaders}>
              {(subheader, i) => (
                <div
                  onClick={() => handleItemClick(i())}
                  class="px-4 py-3 rounded-lg text-sm font-medium cursor-pointer select-none transition-all duration-200 animate-fadeIn"
                  style={{ "animation-delay": `${i() * 50}ms` }}
                  classList={{
                    "bg-gradient-to-r from-orange-500/30 to-red-500/30 text-orange-100 border border-orange-500/40":
                      activeIndex() === i(),
                    "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40":
                      activeIndex() !== i(),
                  }}
                >
                  {subheader}
                </div>
              )}
            </For>
          </nav>
        </div>
      </Show>
    </div>
  );
};

export default Header;
