import { component$ } from "@qwik.dev/core";
import { checkbox, lucide } from "@qds.dev/ui";

export default component$(() => {
    return (
        <checkbox.root class="node0">
            <checkbox.trigger class="node1">
                <checkbox.indicator class="node2">
                    <lucide.check class="node3" />
                    <lucide.minus class="node4" />
                </checkbox.indicator>
            </checkbox.trigger>
            <checkbox.label class="node5">
                Checkbox Label
            </checkbox.label>
        </checkbox.root>
    );
});
