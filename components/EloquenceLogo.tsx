import React from 'react';
import Svg, { Polygon, Circle, Path, Text as SvgText } from 'react-native-svg';

type Props = {
  variant: 'icon' | 'horizontal' | 'vertical';
  size?: number;
};

export const EloquenceLogo = ({ variant, size = 48 }: Props) => {
  if (variant === 'icon') {
    return (
      <Svg width={size} height={size} viewBox="0 0 80 80">
        <Polygon
          points="40,12 65,40 40,68 15,40"
          fill="none"
          stroke="#4F6EF7"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <Circle cx="40" cy="40" r="5" fill="#4F6EF7" />
        <Path d="M6,40 Q12,28 6,16" fill="none" stroke="#4F6EF7" 
          strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
        <Path d="M0,40 Q9,22 0,4" fill="none" stroke="#4F6EF7" 
          strokeWidth="2" strokeLinecap="round" opacity="0.28"/>
        <Path d="M74,40 Q68,28 74,16" fill="none" stroke="#4F6EF7" 
          strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
        <Path d="M80,40 Q71,22 80,4" fill="none" stroke="#4F6EF7" 
          strokeWidth="2" strokeLinecap="round" opacity="0.28"/>
      </Svg>
    );
  }

  if (variant === 'horizontal') {
    const textSize = size * 0.6;
    return (
      <Svg width={size * 4} height={size} viewBox="0 0 280 80">
        <Polygon points="40,12 65,40 40,68 15,40" fill="none"
          stroke="#4F6EF7" strokeWidth="3.5" strokeLinejoin="round"/>
        <Circle cx="40" cy="40" r="5" fill="#4F6EF7"/>
        <Path d="M6,40 Q12,28 6,16" fill="none" stroke="#4F6EF7"
          strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
        <Path d="M74,40 Q68,28 74,16" fill="none" stroke="#4F6EF7"
          strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
        <SvgText x="95" y="52" fontSize="36" fontWeight="700"
          fill="#F0EEE8" letterSpacing="-0.5">Eloquence</SvgText>
      </Svg>
    );
  }

  if (variant === 'vertical') {
    return (
      <Svg width={size * 3} height={size * 3} viewBox="0 0 200 220">
        <Polygon points="100,20 135,60 100,100 65,60" fill="none"
          stroke="#4F6EF7" strokeWidth="3.5" strokeLinejoin="round"/>
        <Circle cx="100" cy="60" r="5.5" fill="#4F6EF7"/>
        <Path d="M30,60 Q42,42 30,24" fill="none" stroke="#4F6EF7"
          strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
        <Path d="M18,60 Q34,36 18,12" fill="none" stroke="#4F6EF7"
          strokeWidth="2" strokeLinecap="round" opacity="0.28"/>
        <Path d="M170,60 Q158,42 170,24" fill="none" stroke="#4F6EF7"
          strokeWidth="2.5" strokeLinecap="round" opacity="0.55"/>
        <Path d="M182,60 Q166,36 182,12" fill="none" stroke="#4F6EF7"
          strokeWidth="2" strokeLinecap="round" opacity="0.28"/>
        <SvgText x="100" y="148" textAnchor="middle" fontSize="28"
          fontWeight="700" fill="#F0EEE8" letterSpacing="-0.3">
          Eloquence
        </SvgText>
        <SvgText x="100" y="168" textAnchor="middle" fontSize="10"
          fontWeight="400" fill="#555553" letterSpacing="2">
          AI SALES INTELLIGENCE
        </SvgText>
      </Svg>
    );
  }

  return null;
};
