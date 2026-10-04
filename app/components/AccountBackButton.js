import React from 'react';
import { TouchableOpacity, Image, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';

// Back to the Account tab, for screens opened from it.
const AccountBackButton = () => {
    const navigation = useNavigation();
    const { assets, colours } = useTheme();

    return (
        <View style={{ width: '100%', paddingHorizontal: 12, paddingBottom: 4 }}>
            <TouchableOpacity
            onPress={() => navigation.navigate('Account')}
            accessibilityRole="button"
            accessibilityLabel="Back to Account"
            style={{ alignSelf: 'flex-start', borderRadius: 100, backgroundColor: colours.card, padding: 4 }}
            >
                <Image
                style={{ width: 32, height: 32 }}
                source={assets.chevron_left}
                />
            </TouchableOpacity>
        </View>
    );
};

export default AccountBackButton;
