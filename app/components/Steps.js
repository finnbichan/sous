import { StyleSheet, Text, TouchableOpacity, Image, View, TextInput } from 'react-native';
import React from 'react';
import useStyles from '../styles/Common';
import { useTheme } from '@react-navigation/native';

const Steps = ({steps, onAddition, onChangeText, onRemove, editable}) => {
    const { assets } = useTheme();
    const styles = useStyles();
    
    return (<>
                {steps.map((x, i) => {
                    return (
                        <Step
                        key={i}
                        number={i}
                        totalNumber={steps.length}
                        value={x}
                        onChangeText={onChangeText}
                        onRemove={onRemove}
                        editable={editable}
                        />
                    )
                })}
                {steps.length < 50 && editable ? (
                    <TouchableOpacity
                    style={styles.stepButton}
                    onPress={onAddition}
                    >
                        <Image
                        style={styles.icon}
                        source={assets.add}
                        />
                    </TouchableOpacity>
                    ):(<></>)}
                </>)
}


const Step = ({number, totalNumber, value, onChangeText, onRemove, editable}) => {
    const { assets, colours } = useTheme();
    const styles = useStyles();
    const placeholder = number === 0 ? 'Add some steps...': 'Add some more...';
    const stepStyles = StyleSheet.create({
        container: {
            width: '100%',
            position: 'relative',
            marginTop: 8,
            marginBottom: 8
        },
        input: {
            width: '95%',
            backgroundColor: colours.card,
            borderRadius: 16,
            color: colours.text,
            marginHorizontal: 8,
            paddingHorizontal: 14,
            paddingTop: 16,
            paddingBottom: 16,
            paddingRight: totalNumber > 1 && editable ? 48 : 14,
            minHeight: 46,
            fontSize: 16
        },
        removeButton: {
            zIndex: 1,
            position: 'absolute',
            right: 8,
            top: 3
        }
    });

    return ( 
        <View style={stepStyles.container}>
            <TextInput
                style={stepStyles.input}
                onChangeText={(text) => onChangeText(number, text)}
                value={value}
                editable={editable}
                placeholder={placeholder}
                placeholderTextColor={colours.secondaryText}
                multiline={true}
            />
            {totalNumber > 1 && editable ? (
                <TouchableOpacity
                    style={[styles.stepButton, stepStyles.removeButton]}
                    onPress={() => onRemove(number)}
                >
                    <Image
                        style={styles.icon}
                        source={assets.cross}
                    />
                </TouchableOpacity>
            ) : null}
        </View>
    )
}

export default Steps;
