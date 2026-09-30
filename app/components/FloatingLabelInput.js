import { Animated, TextInput, StyleSheet, View } from 'react-native';
import React, { useState, useRef } from 'react';
import { useTheme } from '@react-navigation/native';


const FLTextInput = ( {id, label, defaultValue, onChangeTextProp, editable=true, multiline=true, ...inputProps} ) => {
    const { colours } = useTheme();
    const FLInputStyles = StyleSheet.create({
        container: {
          width: '95%',
          marginHorizontal: 8,
          marginTop: 20,
          marginBottom: 8,
          position: 'relative'
        },
        input: {
          width: '100%',
          backgroundColor: colours.card,
          borderRadius: 16,
          color: colours.text,
          paddingHorizontal: 14,
          paddingTop: 18,
          paddingBottom: 10,
          minHeight: 46,
          fontSize: 16
        },
        animatedStyle: {
          zIndex: 1,
          position: 'absolute',
          left: 14,
          top: 16
        },
        labelText: {
          color: colours.secondaryText,
          fontSize: 16
        }
    });
    const [value, setValue] = useState(defaultValue);
    const [isUp, setIsUp] = useState(defaultValue ? true : false);

    const moveText = useRef(new Animated.Value(defaultValue ? 1 : 0)).current;

    const handleBlur = () => {
        if (!value) {
        setIsUp(false);
        Animated.timing(moveText, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true
          }).start();
        }
    }

    const handleFocus = () => {
        setIsUp(true);
        Animated.timing(moveText, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true
        }).start();
    }

    const onChangeText = (text) => {
        setValue(text);
        onChangeTextProp(text);
    }

    const yVal = moveText.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -18],
      });

    const xVal = moveText.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -4],
      });

    const scaleVal = moveText.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 12 / 14],
    });
    
      const animStyle = {
        transform: [
          {
            translateY: yVal,
          },
          {
            translateX: xVal,
          },
          {
            scale: scaleVal,
          },
        ],
      };

    return (
        <View style={FLInputStyles.container}>
            <Animated.View style={[FLInputStyles.animatedStyle, animStyle]}>
                <Animated.Text style={FLInputStyles.labelText}>{label}</Animated.Text>
            </Animated.View>
            <TextInput
            id={id}
            style={[FLInputStyles.input]}
            value={value}
            onChangeText={onChangeText}
            onFocus={handleFocus}
            onBlur={handleBlur}
            multiline={multiline}
            editable={editable}
            {...inputProps}
            />
        </View>
    )
}

export default FLTextInput;
