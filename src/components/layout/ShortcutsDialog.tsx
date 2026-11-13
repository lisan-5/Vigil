import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS } from "./nav";

export function ShortcutsCheatsheet() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {SHORTCUTS.map((g) => (
        <div key={g.group}>
          <h3 className="eyebrow mb-2">{g.group}</h3>
          <dl className="space-y-1.5">
            {g.items.map((i) => (
              <div key={i.label} className="flex items-center justify-between gap-3 text-sm">
                <dt className="text-foreground/90">{i.label}</dt>
                <dd className="flex gap-1">
                  {i.keys.map((k) => (
                    <kbd key={k} className="kbd">
                      {k}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Vigil is built to be driven from the keyboard.</DialogDescription>
        </DialogHeader>
        <ShortcutsCheatsheet />
      </DialogContent>
    </Dialog>
  );
}
