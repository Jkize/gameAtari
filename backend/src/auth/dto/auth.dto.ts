import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export const MAX_GOOGLE_ID_TOKEN_LENGTH = 4_096;
export const MAX_PHANTOM_PUBLIC_KEY_LENGTH = 64;
export const MAX_PHANTOM_MESSAGE_LENGTH = 2_048;
export const MAX_PHANTOM_SIGNATURE_LENGTH = 512;

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_GOOGLE_ID_TOKEN_LENGTH)
  idToken!: string;
}

export class PhantomChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PHANTOM_PUBLIC_KEY_LENGTH)
  publicKey!: string;
}

export class PhantomVerifyDto extends PhantomChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PHANTOM_MESSAGE_LENGTH)
  message!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PHANTOM_SIGNATURE_LENGTH)
  signature!: string;
}

export class CompleteProfileDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,20}$/)
  username!: string;
}
