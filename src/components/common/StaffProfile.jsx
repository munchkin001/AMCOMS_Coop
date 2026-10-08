import ProfileEditor from './ProfileEditor';

const StaffProfile = ({ roleName }) => (
  <ProfileEditor profileType="staff" roleLabel={roleName} />
);

export default StaffProfile;