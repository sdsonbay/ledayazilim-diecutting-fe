import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui'
import { View } from 'react-native'
import { BottomTabBar, TABS, TopNav } from '../../components/AppChrome'
import { useIsWide } from '../../components/ui'
import { useTheme } from '../../theme/ThemeContext'

export default function TabsLayout() {
  const wide = useIsWide()
  const { colors } = useTheme()
  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.bg }}>
      {wide ? <TopNav /> : null}
      <View style={{ flex: 1 }}>
        <TabSlot />
      </View>
      {wide ? null : <BottomTabBar />}
      {/* Rotaları kaydeder; görünür çubuk yukarıdaki özel bileşenlerdir. */}
      <TabList style={{ display: 'none' }}>
        {TABS.map((tab) => (
          <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
        ))}
      </TabList>
    </Tabs>
  )
}
