import { component$ } from "@qwik.dev/core";
import { checkbox, lucide } from "@qds.dev/ui";

export default component$(() => {
    return (
        <checkbox.root class="flex items-center gap-2">
            <checkbox.trigger class="grid place-items-center size-4.5 border-[1.6px] border-sky-35 rounded transition-colors hover:border-sky-45 ui-checked:border-sky-55 ui-checked:bg-sky-55 ui-disabled:border-slate-25 ui-disabled:bg-slate-5 ui-mixed:bg-sky-55 ui-mixed:border-sky-55">
                <checkbox.indicator class="ui-disabled:text-slate-50 text-white *:size-3 *:hidden">
                    <lucide.check class="ui-checked:block" />
                    <lucide.minus class="ui-mixed:block" />
                </checkbox.indicator>
            </checkbox.trigger>
            <checkbox.label class="text-sm font-semibold leading-5">
                Checkbox Label
            </checkbox.label>
        </checkbox.root>
    );
});
