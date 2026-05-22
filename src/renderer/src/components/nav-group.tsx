import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem
} from '@/components/ui/sidebar'
import type { AuthenticatedView, SidebarNavGroup, SidebarNavItem } from '@/components/app-shared'
import { ChevronRightIcon } from 'lucide-react'

type NavGroupProps = {
  group: SidebarNavGroup
  currentView: AuthenticatedView
  onNavigate: (view: AuthenticatedView) => void
}

export function NavGroup({ group, currentView, onNavigate }: NavGroupProps): React.JSX.Element {
  const { items } = group

  return (
    <SidebarGroup className="p-0">
      <SidebarMenu className="gap-2">
        {items.map((item) => (
          <Collapsible
            asChild
            className="group/collapsible"
            defaultOpen={isItemActive(item, currentView)}
            key={item.view ?? item.title}
          >
            <SidebarMenuItem>
              {item.subItems?.length ? (
                <>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={isItemActive(item, currentView)} size="lg">
                      {item.icon}
                      <span>{item.title}</span>
                      <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.subItems?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.view ?? subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isItemActive(subItem, currentView)}
                          >
                            <button
                              type="button"
                              onClick={() => subItem.view && onNavigate(subItem.view)}
                            >
                              {subItem.icon}
                              <span>{subItem.title}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : (
                <SidebarMenuButton asChild isActive={isItemActive(item, currentView)} size="lg">
                  <button type="button" onClick={() => item.view && onNavigate(item.view)}>
                    {item.icon}
                    <span>{item.title}</span>
                  </button>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function isItemActive(item: SidebarNavItem, currentView: AuthenticatedView): boolean {
  if (item.view === currentView) {
    return true
  }

  return item.subItems?.some((subItem) => isItemActive(subItem, currentView)) ?? false
}
