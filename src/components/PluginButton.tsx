import { JSX } from 'solid-js';

type PluginButtonProps = {
    onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
    children?: JSX.Element;
    title?: string;
};

const PluginButton = (props: PluginButtonProps) => (
    <button
        onClick={props.onClick}
        title={props.title}
        class="h-12 rounded bg-neutral-900 flex items-center justify-center text-white hover:bg-neutral-700 transition-colors px-4 text-bold cursor-pointer select-none"
    >
        {props.children}
    </button>
);

export default PluginButton;