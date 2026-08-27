import { DesktopClasses } from '../components/desktop/DesktopClasses'

export default function ClassesPage({ embedded = false }: { embedded?: boolean }) {
  return <DesktopClasses embedded={embedded} />
}
